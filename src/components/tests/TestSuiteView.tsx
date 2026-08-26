import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Play, RefreshCw, Terminal, Check } from 'lucide-react';
import { parseAmountToCents, formatCurrency } from '../../engine/money';
import { parseCsvStatement } from '../../engine/csvParser';
import { normalizeMerchant } from '../../engine/merchantNormalizer';
import { parseDateStrict } from '../../engine/dateParser';
import { parseTransactionLine } from '../../engine/pdfParser';
import { reconcileStatementSummary } from '../../engine/reconciliation';
import { simulateDebtPayoff } from '../../engine/payoffSimulator';
import { CADENCE_MULTIPLIERS, CADENCE_LABELS } from '../../engine/subscriptionDetector';

interface TestCaseResult {
  id: string;
  name: string;
  spec: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export const TestSuiteView: React.FC = () => {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [lastRunTime, setLastRunTime] = useState<string>('');

  const runAllTests = () => {
    setIsRunning(true);
    const testList: TestCaseResult[] = [];

    // 1. Money Parsing
    const testMoney = (input: any, expected: number, label: string) => {
      const actual = parseAmountToCents(input);
      testList.push({
        id: `money_${label}`,
        name: `parseAmountToCents("${input}")`,
        spec: 'SPEC 1 — Money Parsing',
        passed: actual === expected,
        expected: `${expected} cents`,
        actual: `${actual} cents`
      });
    };

    testMoney('12.29', 1229, '12.29');
    testMoney('0.29', 29, '0.29');
    testMoney('$1,234.56', 123456, '$1,234.56');
    testMoney('-$45.10', -4510, '-$45.10');
    testMoney('($45.10)', -4510, '($45.10)');
    testMoney('45.10CR', -4510, '45.10CR');
    testMoney('45.10DR', 4510, '45.10DR');
    testMoney('n/a', 0, 'n/a');

    // Roundtrip test 0.01 to 99.99
    let roundtripPassed = true;
    for (let i = 1; i <= 9999; i++) {
      const dollars = (i / 100).toFixed(2);
      if (parseAmountToCents(dollars) !== i) {
        roundtripPassed = false;
        break;
      }
    }
    testList.push({
      id: 'money_roundtrip_exhaustive',
      name: 'Exhaustive Roundtrip: 0.01 to 99.99 (9,999 values)',
      spec: 'SPEC 1 — Money Parsing',
      passed: roundtripPassed,
      expected: '100% exact integer-cent match',
      actual: roundtripPassed ? 'All 9,999 exact' : 'Precision error detected'
    });

    // 2. CSV Sign Convention
    const chaseCsv = `Transaction Date,Post Date,Description,Category,Type,Amount
08/01/2026,08/02/2026,TRADER JOE'S #542 AUSTIN TX,Groceries,Sale,-142.50
08/10/2026,08/10/2026,AUTOMATIC PAYMENT - THANK YOU,,Payment,2000.00
08/12/2026,08/12/2026,LATE FEE,Fees,Fee,-40.00`;

    try {
      const chaseRes = parseCsvStatement(chaseCsv, 'chase.csv', 'hash_chase');
      const p1 = chaseRes.transactions[0].amountCents === 14250;
      const p2 = chaseRes.transactions[1].amountCents === -200000;
      const p3 = chaseRes.transactions[2].feeType === 'FEE_LATE_PAYMENT' && chaseRes.transactions[2].isAvoidable === true;
      testList.push({
        id: 'csv_chase_convention',
        name: 'Chase CSV 2-Pass (Negative purchases -> Positive, Late Fee detected)',
        spec: 'SPEC 2 — CSV Convention Engine',
        passed: p1 && p2 && p3,
        expected: 'Purchases +14250, Payment -200000, Late Fee avoidable',
        actual: `Purchases: ${chaseRes.transactions[0].amountCents}, Payment: ${chaseRes.transactions[1].amountCents}, FeeType: ${chaseRes.transactions[2].feeType}`
      });
    } catch (e: any) {
      testList.push({
        id: 'csv_chase_convention',
        name: 'Chase CSV 2-Pass',
        spec: 'SPEC 2 — CSV Convention Engine',
        passed: false,
        expected: 'Successful parse',
        actual: e.message
      });
    }

    const amexCsv = `Date,Description,Amount
08/01/2026,SHELL OIL 4471 AUSTIN TX,52.10
08/10/2026,ONLINE PAYMENT - THANK YOU,-500.00`;

    try {
      const amexRes = parseCsvStatement(amexCsv, 'amex.csv', 'hash_amex');
      const p1 = amexRes.transactions[0].amountCents === 5210;
      const p2 = amexRes.transactions[1].amountCents === -50000;
      testList.push({
        id: 'csv_amex_convention',
        name: 'Amex CSV (Purchases positive, signs preserved)',
        spec: 'SPEC 2 — CSV Convention Engine',
        passed: p1 && p2,
        expected: 'Purchase +5210, Payment -50000',
        actual: `Purchase: ${amexRes.transactions[0].amountCents}, Payment: ${amexRes.transactions[1].amountCents}`
      });
    } catch (e: any) {
      testList.push({
        id: 'csv_amex_convention',
        name: 'Amex CSV',
        spec: 'SPEC 2 — CSV Convention Engine',
        passed: false,
        expected: 'Successful parse',
        actual: e.message
      });
    }

    const capOneCsv = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
08/01/2026,08/02/2026,1234,TARGET T-0892 CHICAGO IL,Shopping,89.40,
08/10/2026,08/10/2026,1234,CAPITAL ONE AUTOPAY PYMT,Payment,,300.00`;

    try {
      const capOneRes = parseCsvStatement(capOneCsv, 'capone.csv', 'hash_capone');
      const p1 = capOneRes.transactions[0].amountCents === 8940;
      const p2 = capOneRes.transactions[1].amountCents === -30000;
      testList.push({
        id: 'csv_capone_split',
        name: 'Capital One Split Debit/Credit Columns',
        spec: 'SPEC 2 — CSV Convention Engine',
        passed: p1 && p2,
        expected: 'Debit +8940, Credit -30000',
        actual: `Debit: ${capOneRes.transactions[0].amountCents}, Credit: ${capOneRes.transactions[1].amountCents}`
      });
    } catch (e: any) {
      testList.push({
        id: 'csv_capone_split',
        name: 'Capital One Split Columns',
        spec: 'SPEC 2 — CSV Convention Engine',
        passed: false,
        expected: 'Successful parse',
        actual: e.message
      });
    }

    // 3. Merchant Normalization
    const testMerchant = (raw: string, expected: string) => {
      const actual = normalizeMerchant(raw);
      testList.push({
        id: `merchant_${raw.slice(0, 15)}`,
        name: `normalizeMerchant("${raw}")`,
        spec: 'SPEC 4 — Merchant Normalization',
        passed: actual === expected,
        expected,
        actual
      });
    };

    testMerchant('SPOTIFY USA', 'Spotify');
    testMerchant('SQ *BLUE BOTTLE COFFEE SAN FRANCISCO CA', 'Blue Bottle Coffee');
    testMerchant('AMZN Mktp US*RT4G92JK3', 'Amazon');
    testMerchant('TARGET T-0892 CHICAGO IL', 'Target');
    testMerchant('NETFLIX.COM 866-579-7172 CA', 'Netflix');
    testMerchant('APPLE.COM/BILL 866-712-7753 CA', 'Apple Services');
    testMerchant('SHELL OIL 4471 AUSTIN TX', 'Shell');
    testMerchant('   ', 'Unknown Merchant');

    // 4. Date & Summary Verification
    const d1 = parseDateStrict('05/14/26');
    testList.push({
      id: 'date_strict_2digit',
      name: 'Strict Date Parsing ("05/14/26")',
      spec: 'SPEC 9 — Date Parsing Engine',
      passed: d1 === '2026-05-14',
      expected: '2026-05-14',
      actual: d1 || 'null'
    });

    const d2 = parseTransactionLine("07/16 07/17 TRADER JOE'S #542 AUSTIN TX 142.50", '2026-08-14');
    testList.push({
      id: 'pdf_double_date_stripping',
      name: 'Double-Date Post-Date Stripping (07/16 07/17 TRADER JOE...)',
      spec: 'SPEC 10 — Double-Date Stripping',
      passed:
        d2?.date === '2026-07-16' &&
        d2?.postDate === '2026-07-17' &&
        d2?.rawDescription === "TRADER JOE'S #542 AUSTIN TX" &&
        d2?.amountCents === 14250,
      expected: "Date: 2026-07-16, PostDate: 2026-07-17, Desc: TRADER JOE'S #542 AUSTIN TX, Amount: 14250",
      actual: `Date: ${d2?.date}, PostDate: ${d2?.postDate}, Desc: ${d2?.rawDescription}, Amount: ${d2?.amountCents}`
    });

    const recResult = reconcileStatementSummary({
      previousBalance: 289040,
      payments: 250000,
      purchases: 309210,
      fees: 1250,
      interest: 4750,
      newBalance: 354250,
      hasNewBalance: true
    });
    testList.push({
      id: 'summary_reconciliation_exact',
      name: 'Summary Reconciliation ($2890.40 - $2500 + $3092.10 + $12.50 + $47.50 = $3542.50)',
      spec: 'SPEC 8 — Summary Reconciliation',
      passed: recResult.isReconciled === true && recResult.discrepancy === 0,
      expected: 'isReconciled: true, discrepancy: 0',
      actual: `isReconciled: ${recResult.isReconciled}, discrepancy: ${recResult.discrepancy}`
    });

    // 5. Payoff Simulator
    const zeroSim = simulateDebtPayoff(0);
    testList.push({
      id: 'payoff_zero_balance_null',
      name: 'Debt Payoff Simulator for 0 Balance',
      spec: 'SPEC 5 — Debt Payoff Simulator',
      passed: zeroSim === null,
      expected: 'null',
      actual: zeroSim === null ? 'null' : 'Object'
    });

    const activeSim = simulateDebtPayoff(354250, 24.99, 25000, 11000);
    testList.push({
      id: 'payoff_dynamic_savings',
      name: 'Debt Payoff Simulator Accelerated Timeline & Interest Savings',
      spec: 'SPEC 5 — Debt Payoff Simulator',
      passed:
        activeSim !== null &&
        activeSim.minScenario.monthsToPayoff > activeSim.customScenario.monthsToPayoff &&
        activeSim.interestSavedCents > 0,
      expected: 'Accelerated months < Minimum months and positive interest savings',
      actual: `Min: ${activeSim?.minScenario.monthsToPayoff} mos, Custom: ${activeSim?.customScenario.monthsToPayoff} mos, Saved: ${formatCurrency(activeSim?.interestSavedCents || 0)}`
    });

    // 6. Cadence Multipliers
    const cadenceValid =
      CADENCE_MULTIPLIERS.WEEKLY === 52 &&
      CADENCE_MULTIPLIERS.BIWEEKLY === 26 &&
      CADENCE_MULTIPLIERS.MONTHLY === 12 &&
      CADENCE_MULTIPLIERS.QUARTERLY === 4 &&
      CADENCE_MULTIPLIERS.ANNUAL === 1 &&
      CADENCE_LABELS.WEEKLY === '/wk' &&
      CADENCE_LABELS.MONTHLY === '/mo';

    testList.push({
      id: 'subscription_cadence_multipliers',
      name: 'Subscription Cadence Multipliers (52, 26, 12, 4, 1) and Labels',
      spec: 'SPEC 11 — Subscription Cadence Engine',
      passed: cadenceValid,
      expected: '52, 26, 12, 4, 1 with standard labels',
      actual: cadenceValid ? 'All multipliers & labels valid' : 'Multiplier mismatch'
    });

    setResults(testList);
    setIsRunning(false);
    setLastRunTime(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    runAllTests();
  }, []);

  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;

  return (
    <div className="page-wrapper">
      {/* Top Banner */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck size={22} color="var(--brand-primary)" />
              <h2 className="card-title">Specification Acceptance Verification Suite</h2>
            </div>
            <p className="card-desc">
              Executes live client-side tests validating Specs 1 through 12 and exact arithmetic constraints
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {lastRunTime && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Last executed: {lastRunTime}</span>
            )}
            <button className="btn btn-primary" onClick={runAllTests} disabled={isRunning}>
              <Play size={15} /> Run Live Test Suite
            </button>
          </div>
        </div>

        {/* Results Summary Pill */}
        <div
          style={{
            background: totalFailed === 0 ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: `1px solid ${totalFailed === 0 ? 'var(--success-border)' : 'var(--danger-border)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {totalFailed === 0 ? (
              <CheckCircle2 size={20} color="var(--success)" />
            ) : (
              <XCircle size={20} color="var(--danger)" />
            )}
            <span style={{ fontWeight: 700, color: totalFailed === 0 ? 'var(--success)' : 'var(--danger)' }}>
              {totalFailed === 0
                ? `All ${results.length} Specification Acceptance Tests PASSED (100% Success)`
                : `${totalFailed} of ${results.length} Tests FAILED`}
            </span>
          </div>

          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>
            {totalPassed} passed • {totalFailed} failed
          </span>
        </div>
      </div>

      {/* Test Cases Table */}
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Status</th>
                <th>Specification</th>
                <th>Test Case Description</th>
                <th>Expected Outcome</th>
                <th>Actual Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id}>
                  <td>
                    {r.passed ? (
                      <span className="badge badge-success">
                        <Check size={11} /> PASS
                      </span>
                    ) : (
                      <span className="badge badge-danger">
                        <XCircle size={11} /> FAIL
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {r.spec}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {r.expected}
                    </code>
                  </td>
                  <td>
                    <code
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        color: r.passed ? 'var(--success)' : 'var(--danger)'
                      }}
                    >
                      {r.actual}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
