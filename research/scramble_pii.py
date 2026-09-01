"""
Scrambles cardholder-identity PII in a statement PDF *in place on the page* — same font,
position, and page layout, only the literal text of specific identity fields changes. Everything
else (transaction line items, merchant names, dates, amounts, balances, issuer boilerplate/
customer-service numbers) is left untouched by design; see ../agent/PII_SCRAMBLING.md for why and
for the fields that are in scope.

This is an *additional* safety layer on top of ../agent/PII_HANDLING.md, not a replacement for it.
A scrambled output file is still local-only: don't git-add it, don't paste its content into chat/
docs, don't hand it to a subagent or network-reaching tool without the same care as the original.

Two-step workflow, deliberately not one-shot auto-redact:

  1. scan  — read-only. Reports *candidate* PII locations (counts/patterns), not literal text,
             unless --reveal is passed (same convention as inspect_statement.py). You read the
             --reveal output yourself and build a mapping file from it.
  2. apply — takes a mapping JSON of {"literal string": "replacement string", ...} you wrote by
             hand, replaces every occurrence of each literal throughout the PDF at its original
             position, and then self-checks that none of the original literals remain anywhere in
             the output. Refuses to leave a silently-incomplete scramble.

Usage:
    python experiments/scramble_pii.py scan <input.pdf> [--reveal]
    python experiments/scramble_pii.py apply <input.pdf> <output.pdf> <mapping.json>
    python experiments/scramble_pii.py check <input.pdf> <mapping.json>
"""
import json
import re
import sys

import fitz  # PyMuPDF

PHONE_RE = re.compile(r"\b(?:\d[-.\s]?){10}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
ACCOUNT_CONTEXT_RE = re.compile(
    r"(Account\s*(Number|Ending)|Card\s*Ending|Prepared for)[:\s#-]*([A-Za-z0-9-]{4,})",
    re.IGNORECASE,
)


def _page_lines(doc):
    """Yield (page_index, line_text) for every non-blank line in the document."""
    for pno, page in enumerate(doc):
        text = page.get_text()
        for line in text.splitlines():
            line = line.strip()
            if line:
                yield pno, line


def _normalize_for_repeat_check(line):
    # Strip page-number-ish trailing tokens ("p.4/13") so the same header/footer line on
    # different pages normalizes to the same string for the repeat-frequency heuristic.
    return re.sub(r"p\.\s*\d+\s*/\s*\d+", "", line).strip()


def scan(pdf_path, reveal):
    doc = fitz.open(pdf_path)
    n_pages = doc.page_count
    lines = list(_page_lines(doc))

    # Heuristic 1: lines that repeat near-identically across most pages — this is exactly the
    # "CARDHOLDER NAME  AccountEnding-XXXXX  p.N/M" watermark pattern issuers print on every page.
    freq = {}
    for _, line in lines:
        key = _normalize_for_repeat_check(line)
        freq[key] = freq.get(key, 0) + 1
    repeated = {k: v for k, v in freq.items() if v >= max(2, n_pages // 2) and len(k) > 3}

    # Heuristic 2: pattern matches (phone, email, SSN-like, "Account Number/Ending ..." context).
    pattern_hits = {"phone": [], "email": [], "ssn": [], "account_context": []}
    for pno, line in lines:
        if PHONE_RE.search(line):
            pattern_hits["phone"].append((pno, line))
        if EMAIL_RE.search(line):
            pattern_hits["email"].append((pno, line))
        if SSN_RE.search(line):
            pattern_hits["ssn"].append((pno, line))
        m = ACCOUNT_CONTEXT_RE.search(line)
        if m:
            pattern_hits["account_context"].append((pno, line))

    print(f"=== scan: {pdf_path} ({n_pages} pages) ===")
    print(f"\nRepeated near-identical lines (likely name/account header-footer watermark):")
    for k, v in sorted(repeated.items(), key=lambda kv: -kv[1]):
        if reveal:
            print(f"  [{v}x] {k!r}")
        else:
            print(f"  [{v}x] <{len(k)} chars, reveal suppressed>")

    for label, hits in pattern_hits.items():
        print(f"\n{label} — {len(hits)} line(s) matched:")
        # Note: this will legitimately include issuer customer-service numbers, not just
        # cardholder-specific fields (e.g. phone-context hits) — that's expected. Read
        # ../agent/PII_SCRAMBLING.md's "what NOT to scramble" note before building a mapping:
        # only cardholder-identity fields belong in mapping.json, not the issuer's own boilerplate
        # contact info or merchant phone numbers embedded in transaction descriptions.
        for pno, line in hits[:20]:
            if reveal:
                print(f"  p.{pno + 1}: {line!r}")
            else:
                print(f"  p.{pno + 1}: <{len(line)} chars, reveal suppressed>")

    if not reveal:
        print(
            "\n(Literal text suppressed by default — pass --reveal for local-only review. "
            "See ../agent/PII_HANDLING.md before doing so on a real statement; never pass "
            "--reveal on the user's behalf against data/personal_statements/.)"
        )
    doc.close()


def _fit_fontsize(text, rect_width, fontname="helv", max_size=12.0, min_size=4.0):
    """Largest fontsize (down to min_size) at which `text` fits within rect_width."""
    size = max_size
    while size > min_size:
        if fitz.get_text_length(text, fontname=fontname, fontsize=size) <= rect_width * 0.95:
            return size
        size -= 0.5
    return min_size


def _match_font_info(dict_data, rect):
    """Find the span whose bbox most overlaps `rect` — gives us the *original* font size and
    baseline origin of the text being replaced, and the full list of spans sharing its line (for
    _right_limit below)."""
    best_span, best_line_spans, best_overlap = None, None, 0.0
    for block in dict_data["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                inter = fitz.Rect(span["bbox"]) & rect
                overlap = 0.0 if inter.is_empty else inter.width * inter.height
                if overlap > best_overlap:
                    best_overlap, best_span, best_line_spans = overlap, span, line["spans"]
    if best_span is None:
        return None, None, None
    return best_span["size"], best_span["origin"], best_line_spans


def _right_limit(line_spans, rect, page_width, margin=18):
    """How far right the replacement can extend on this line before it would run into the next
    span's text (or the page margin, if this is the last thing on the line)."""
    limit = page_width - margin
    for span in line_spans or []:
        sb = fitz.Rect(span["bbox"])
        if sb.x0 >= rect.x1 - 0.5:  # a span that starts at/after the end of our matched text
            limit = min(limit, sb.x0 - 2)
    return limit


def apply_mapping(pdf_path, out_path, mapping_path):
    with open(mapping_path, "r", encoding="utf-8") as f:
        mapping = json.load(f)
    if not mapping:
        print("Error: mapping file is empty — nothing to do.")
        sys.exit(1)

    doc = fitz.open(pdf_path)
    total_replacements = 0
    per_literal_counts = {lit: 0 for lit in mapping}
    shrink_warnings = []  # (literal, replacement, page_no, original_size, used_size)

    for pno, page in enumerate(doc):
        # Read the page's text layout once, before this page's own redactions touch it — used to
        # look up each match's *original* font size/baseline and how much room it has to grow into.
        dict_data = page.get_text("dict")
        page_width = page.rect.width
        draws = []  # (baseline_point, replacement, fontsize) — drawn only after erasure is applied

        for literal, replacement in mapping.items():
            rects = page.search_for(literal)
            for r in rects:
                # Inset vertically: PyMuPDF's word rects include font ascent/descent padding
                # that can overlap a tightly-spaced neighboring line. apply_redactions() removes
                # any glyph whose bbox intersects the redaction rect at all, so an un-inset rect
                # can silently eat part of the line above/below. Shrinking to the inked-glyph
                # core avoids that bleed while still fully covering the target text.
                pad_y = r.height * 0.12
                y0, y1 = r.y0 + pad_y, r.y1 - pad_y

                # Prefer keeping the ORIGINAL font size — a shrunk replacement is a visible,
                # systematic tell (and a bias risk for anything trained/scored on layout) that's
                # worse than a slightly wider whited-out box. Only shrink if the replacement
                # truly can't fit even out to the next thing on the line.
                orig_size, origin, line_spans = _match_font_info(dict_data, r)
                orig_size = orig_size or 9.0
                # Use the matched span's baseline Y (constant across its whole line) but our own
                # matched rect's X — the span's origin X is where its *full* text starts, which is
                # only correct when the literal is the whole span. When the literal is a substring
                # of a larger span (e.g. "-21001" inside "Ending -21001"), using the span's origin
                # X draws the replacement over the preceding text instead of after it.
                baseline_y = origin[1] if origin else r.y1 - r.height * 0.2
                origin = (r.x0, baseline_y)
                right_limit = _right_limit(line_spans, r, page_width)
                needed_width = fitz.get_text_length(replacement, fontname="helv", fontsize=orig_size)
                available_width = right_limit - r.x0

                if needed_width <= available_width:
                    fontsize = orig_size
                    x1 = r.x0 + needed_width
                else:
                    fontsize = _fit_fontsize(replacement, available_width, max_size=orig_size)
                    x1 = right_limit
                    if fontsize < orig_size * 0.85:
                        shrink_warnings.append((literal, replacement, pno + 1, orig_size, fontsize))

                # Erase only — no `text` here. add_redact_annot's own text-insertion silently
                # invokes its internal shrink-to-fit and overrides the requested fontsize even
                # with width/height to spare (the exact bug that produced the too-small text
                # reported against the first version of this script). Drawing is done separately
                # below, after apply_redactions(), with insert_text() at the original baseline —
                # that API draws literally at the given size, no auto-shrink.
                erase_rect = fitz.Rect(r.x0, y0, max(x1, r.x1), y1)
                page.add_redact_annot(erase_rect, fill=(1, 1, 1))
                draws.append((origin, replacement, fontsize))
                per_literal_counts[literal] += 1
                total_replacements += 1

        if draws:
            page.apply_redactions()
            for origin, replacement, fontsize in draws:
                page.insert_text(origin, replacement, fontsize=fontsize, fontname="helv", color=(0, 0, 0))

    doc.save(out_path)
    doc.close()

    print(f"Applied {total_replacements} replacement(s) across {len(mapping)} literal(s):")
    for lit, count in per_literal_counts.items():
        flag = "" if count > 0 else "  <-- ZERO occurrences found, check your literal string"
        print(f"  {count:3d}x  {lit!r}{flag}")
    if shrink_warnings:
        print(
            f"\n{len(shrink_warnings)} occurrence(s) needed a smaller font than the original "
            f"(replacement text too wide to fit even into available whitespace) — consider a "
            f"shorter replacement value for these:"
        )
        for lit, repl, pno, orig, used in shrink_warnings:
            print(f"  p.{pno}: {lit!r} -> {repl!r}  ({orig:.1f}pt -> {used:.1f}pt)")
    print(f"\nWrote: {out_path}")

    _self_check(out_path, mapping)


def _self_check(pdf_path, mapping):
    """Hard-fail loudly if any original literal is still present, or if a replacement never
    actually made it into the output text (silent text-insertion failure — see the fontsize=-1
    bug this guarded against: the original was erased but the replacement never got drawn)."""
    doc = fitz.open(pdf_path)
    full_text = "\n".join(page.get_text() for page in doc)
    doc.close()

    leaks = [lit for lit in mapping if lit in full_text]
    missing = [repl for repl in mapping.values() if repl not in full_text]
    print("\n=== self-check ===")
    ok = True
    if leaks:
        ok = False
        print("FAILED — the following original literal(s) are still present in the output:")
        for lit in leaks:
            print(f"  {lit!r}")
    if missing:
        ok = False
        print(
            "FAILED — the following replacement(s) never actually appear in the output text "
            "(likely a silent text-insertion failure, not just a missed match):"
        )
        for repl in missing:
            print(f"  {repl!r}")
    if not ok:
        print(
            "This output file must NOT be treated as scrambled — it either still contains "
            "original PII-scoped text, or erased it without drawing the replacement."
        )
        sys.exit(1)
    else:
        print(
            f"PASSED — none of the {len(mapping)} original literal(s) remain, and all "
            f"replacements are present in {pdf_path}."
        )


def check(pdf_path, mapping_path):
    with open(mapping_path, "r", encoding="utf-8") as f:
        mapping = json.load(f)
    _self_check(pdf_path, mapping)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "scan":
        scan(sys.argv[2], reveal="--reveal" in sys.argv)
    elif cmd == "apply":
        if len(sys.argv) < 5:
            print(__doc__)
            sys.exit(1)
        apply_mapping(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "check":
        if len(sys.argv) < 4:
            print(__doc__)
            sys.exit(1)
        check(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)
