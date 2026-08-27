# Credit Card & Bank Statement Parser Research & Test Fixtures

**Date:** August 27, 2026  
**Project:** NestLedger  
**Target Subsystem:** PDF Parsing & Extraction Engine ([`src/engine/pdfParser.ts`](../src/engine/pdfParser.ts))

---

## Executive Summary

When developing NestLedger's financial parsing engine, using personal credit card and bank statements poses security risks regarding Personally Identifiable Information (PII). This document consolidates open-source statement parser projects, synthetic test datasets, PDF generator frameworks, and architectural design patterns for major US credit card issuers (**Chase, American Express, Citi, Capital One, Discover, Bank of America**).

---

## 1. Top Open-Source Statement Parsers & Libraries

### A. JavaScript & TypeScript (Direct NestLedger / Web Compatibility)

* **[`electrovir/statement-parser`](https://github.com/electrovir/statement-parser)**
  * **Tech Stack:** TypeScript / Node.js
  * **Supported Issuers:** Chase, Citi, USAA
  * **Key Features:** Pure TypeScript package with modular, bank-specific regex parsers. Great reference for line-item regex tokenization and summary block extraction.
* **[`tio-ze-rj/banksheet`](https://github.com/tio-ze-rj/banksheet)**
  * **Tech Stack:** TypeScript / Node.js
  * **Supported Issuers:** Chase, American Express (Amex), custom plugins
  * **Key Features:** Local-only parser engine converting PDF statements to CSV, JSON, or Excel using spatial bounding-box grouping.

### B. Python (Feature-Rich Financial Parser Ecosystem)

* **[`benjamin-awd/monopoly`](https://github.com/benjamin-awd/monopoly)**
  * **Tech Stack:** Python (`pdfplumber`, `camelot`)
  * **Supported Issuers:** Multi-bank support (US & International)
  * **Key Features:** Supports table extraction, password-protected PDFs, and OCR fallbacks. Includes sample PDF test files in `src/monopoly/examples/example_statement.pdf`.
* **[`m-d-brown/plain-text-accounting-tools`](https://github.com/m-d-brown/plain-text-accounting-tools)**
  * **Tech Stack:** Python
  * **Supported Issuers:** Chase, American Express (Amex), Capital One
  * **Key Features:** Tailored for plain-text accounting (Beancount/Ledger). Demonstrates precise regex rules for extracting date pairs (transaction vs. post date) and merchant normalization.
* **[`sortelli/parse_capitalone_pdf_statement`](https://github.com/sortelli/parse_capitalone_pdf_statement)**
  * **Tech Stack:** Python (`pdfplumber`, `pandas`)
  * **Supported Issuers:** Capital One Credit Cards
  * **Key Features:** Dedicated parser for Capital One multi-column statement tables.
* **[`matthewrwilton/citibank-statement-to-csv`](https://github.com/matthewrwilton/citibank-statement-to-csv)**
  * **Tech Stack:** Python
  * **Supported Issuers:** Citi Credit Cards (Simplicity, Double Cash, Costco)
  * **Key Features:** Focuses specifically on Citibank statement table formats.

### C. Multi-Language & LLM/OCR Hybrid Parsers

* **[`raghuveerd/CCPDFReader`](https://github.com/raghuveerd/CCPDFReader)**
  * **Tech Stack:** Java
  * **Key Features:** Reads PDF statements line-by-line using configurable property files mapping column offsets for different bank formats.
* **[`johnsonhk88/AI-Bank-Statement-Document-Automation`](https://github.com/johnsonhk88/AI-Bank-Statement-Document-Automation-By-LLM-And-Personal-Finanical-Analysis-Prediction)**
  * **Tech Stack:** Python (YOLO layout detection + LLM extraction)
  * **Key Features:** Uses visual layout detection for complex or multi-column PDFs.

---

## 2. Synthetic US Bank Statement PDFs & Datasets

For local unit testing without real PII data:

1. **`monopoly` Sample Statement PDF**:  
   Found in repository: [`src/monopoly/examples/example_statement.pdf`](https://github.com/benjamin-awd/monopoly/blob/main/src/monopoly/examples/example_statement.pdf)
2. **`AI-Bank-Statement` Dummy PDF**:  
   Found in repository: [`data/bank-statement-document/Dummy-Bank-Statement.pdf`](https://github.com/johnsonhk88/AI-Bank-Statement-Document-Automation-By-LLM-And-Personal-Finanical-Analysis-Prediction/blob/main/data/bank-statement-document/Dummy-Bank-Statement.pdf)
3. **CFPB Official 2-Page Credit Card Statement PDF**:  
   Official regulatory sample statement covering standard US sections (*Account Summary, Payment Information, Transactions, Fees & Interest Charged, APR Breakdown*):  
   [CFPB Sample Credit Card Statement (PDF)](https://files.consumerfinance.gov/f/documents/cfpb_building-blocks_student-handout_sample-credit-card-statement.pdf)
4. **HuggingFace `Panhapich/bank-statement-structure-recognition` Dataset**:  
   Thousands of synthetic PDF bank statements designed for table structure and cell layout extraction:  
   [HuggingFace Dataset](https://huggingface.co/datasets/Panhapich/bank-statement-structure-recognition)

---

## 3. Synthetic PDF Generator Tools

If custom edge cases are needed (e.g., negative balances, 100+ transactions, page breaks across years):

* **[`barseghyanartur/faker-file`](https://github.com/barseghyanartur/faker-file)** *(Python)*  
  Combines `Faker` with `ReportLab` to programmatically build synthetic bank statements with custom headers, tables, dates, and amounts:
  ```python
  from faker import Faker
  from faker_file.providers.pdf_reportlab import PdfReportLabProvider

  fake = Faker()
  fake.add_provider(PdfReportLabProvider)

  # Generate synthetic statement PDF
  pdf_file = fake.pdf_reportlab(
      content="CHASE CREDIT CARD STATEMENT\nAccount ending in 4321\n" +
              "\n".join([f"{fake.date_this_year()} {fake.company()} ${fake.random_int(5, 250)}.00" for _ in range(20)])
  )
  ```
* **[`Maninisp/Bank_Statement_Analysis`](https://github.com/Maninisp/Bank_Statement_Analysis)**  
  Includes `generate_DummyStatement.ipynb` for generating dummy transaction data and rendering PDF test fixtures.

---

## 4. Key Architectural Insights for NestLedger (`src/engine/pdfParser.ts`)

Analyzing these open-source tools yields three critical design patterns for NestLedger:

1. **Y-Coordinate Clustering (3.0pt Vertical Tolerance)**  
   PDF text tokens do not contain native newlines. Grouping tokens whose $Y$ coordinates fall within $\pm 3.0\text{pt}$ and sorting left-to-right by $X$ coordinate (implemented in [`src/engine/pdfParser.ts`](../src/engine/pdfParser.ts)) matches standard practice in `pdfplumber` and `banksheet`.
2. **Section Header State Machine**  
   US bank statements group items into explicit sections (*PAYMENTS AND CREDITS*, *PURCHASES*, *FEES CHARGED*, *INTEREST CHARGED*). Detecting section header transitions prevents incorrect transaction type classification when description text omits markers like `ONLINE PAYMENT`.
3. **Summary Figure Reconciliation**  
   Enforcing the mathematical identity:
   $$\text{Previous Balance} - \text{Payments} + \text{Purchases} + \text{Fees} + \text{Interest} = \text{New Balance}$$
   allows NestLedger to verify statement extraction completeness and alert the user if line items were skipped or missed.

---

## 5. References & Direct Links

* **CFPB Official Credit Card Sample:** [Consumer Financial Protection Bureau PDF](https://files.consumerfinance.gov/f/documents/cfpb_building-blocks_student-handout_sample-credit-card-statement.pdf)
* **TypeScript Parser Repo:** [electrovir/statement-parser](https://github.com/electrovir/statement-parser)
* **TypeScript Bounding Box Parser Repo:** [tio-ze-rj/banksheet](https://github.com/tio-ze-rj/banksheet)
* **Python Multi-Bank Parser Repo:** [benjamin-awd/monopoly](https://github.com/benjamin-awd/monopoly)
* **Beancount Plain-Text Accounting Tools:** [m-d-brown/plain-text-accounting-tools](https://github.com/m-d-brown/plain-text-accounting-tools)
* **Capital One PDF Parser:** [sortelli/parse_capitalone_pdf_statement](https://github.com/sortelli/parse_capitalone_pdf_statement)
* **Citibank PDF Parser:** [matthewrwilton/citibank-statement-to-csv](https://github.com/matthewrwilton/citibank-statement-to-csv)
* **Java CCPDFReader Repo:** [raghuveerd/CCPDFReader](https://github.com/raghuveerd/CCPDFReader)
* **Synthetic PDF Generator Repo:** [barseghyanartur/faker-file](https://github.com/barseghyanartur/faker-file)
* **HuggingFace Synthetic Dataset:** [Panhapich/bank-statement-structure-recognition](https://huggingface.co/datasets/Panhapich/bank-statement-structure-recognition)
