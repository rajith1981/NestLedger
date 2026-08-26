/**
 * SPEC 5 — Dynamic Debt Payoff Simulator
 * 
 * Computes exact debt payoff timelines, total interest, savings, and amortization schedules.
 */

export interface PayoffSchedulePoint {
  month: number;
  balanceCents: number;
  interestPaidCents: number;
  principalPaidCents: number;
  totalInterestToDateCents: number;
}

export interface PayoffScenarioResult {
  monthlyPaymentCents: number;
  monthsToPayoff: number;
  totalInterestCents: number;
  totalPaidCents: number;
  isPayable: boolean;
  schedule: PayoffSchedulePoint[];
}

export interface PayoffSimulationResult {
  currentBalanceCents: number;
  aprPercent: number;
  minPaymentCents: number;
  suggestedPaymentCents: number;
  customPaymentCents: number;
  minScenario: PayoffScenarioResult;
  customScenario: PayoffScenarioResult;
  suggestedScenario: PayoffScenarioResult;
  interestSavedCents: number;
  monthsSaved: number;
}

/**
 * Calculate amortization curve for a single monthly payment amount
 */
export function calculateAmortization(
  balanceCents: number,
  aprPercent: number,
  monthlyPaymentCents: number
): PayoffScenarioResult {
  if (balanceCents <= 0) {
    return {
      monthlyPaymentCents,
      monthsToPayoff: 0,
      totalInterestCents: 0,
      totalPaidCents: 0,
      isPayable: true,
      schedule: []
    };
  }

  const monthlyRate = aprPercent / 100 / 12;
  let remaining = balanceCents;
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;
  const maxMonths = 360; // 30-year limit
  const schedule: PayoffSchedulePoint[] = [];

  // Add month 0 starting point
  schedule.push({
    month: 0,
    balanceCents: remaining,
    interestPaidCents: 0,
    principalPaidCents: 0,
    totalInterestToDateCents: 0
  });

  const firstMonthInterest = Math.round(remaining * monthlyRate);
  if (monthlyPaymentCents <= firstMonthInterest) {
    return {
      monthlyPaymentCents,
      monthsToPayoff: Infinity,
      totalInterestCents: Infinity,
      totalPaidCents: Infinity,
      isPayable: false,
      schedule
    };
  }

  while (remaining > 0 && month < maxMonths) {
    month++;
    const interest = Math.round(remaining * monthlyRate);
    totalInterest += interest;

    let payment = monthlyPaymentCents;
    if (remaining + interest < payment) {
      payment = remaining + interest;
    }

    const principal = payment - interest;
    remaining = Math.max(0, remaining - principal);
    totalPaid += payment;

    if (month <= 60 || month % 3 === 0 || remaining === 0) {
      schedule.push({
        month,
        balanceCents: remaining,
        interestPaidCents: interest,
        principalPaidCents: principal,
        totalInterestToDateCents: totalInterest
      });
    }
  }

  return {
    monthlyPaymentCents,
    monthsToPayoff: month,
    totalInterestCents: totalInterest,
    totalPaidCents: totalPaid,
    isPayable: remaining === 0,
    schedule
  };
}

/**
 * Run full dynamic payoff simulation with minimum, suggested, and custom payments
 */
export function simulateDebtPayoff(
  balanceCents: number,
  aprPercent: number = 24.99,
  customPaymentCents?: number,
  statementMinPaymentCents?: number
): PayoffSimulationResult | null {
  const currentBalanceCents = Math.max(0, balanceCents);

  // If balance is 0, return null per SPEC 5
  if (currentBalanceCents === 0) {
    return null;
  }

  // Minimum payment: statement min or standard 1% + interest ($35 min)
  const minPaymentCents = statementMinPaymentCents || Math.max(3500, Math.round(currentBalanceCents * 0.01));

  // Suggested payment: Max(2 * minPayment, 5% of balance)
  const suggestedPaymentCents = Math.max(2 * minPaymentCents, Math.round(currentBalanceCents * 0.05));

  // Custom payment
  const activeCustomPayment = customPaymentCents ?? suggestedPaymentCents;

  const minScenario = calculateAmortization(currentBalanceCents, aprPercent, minPaymentCents);
  const suggestedScenario = calculateAmortization(currentBalanceCents, aprPercent, suggestedPaymentCents);
  const customScenario = calculateAmortization(currentBalanceCents, aprPercent, activeCustomPayment);

  const interestSavedCents =
    minScenario.isPayable && customScenario.isPayable
      ? Math.max(0, minScenario.totalInterestCents - customScenario.totalInterestCents)
      : (!minScenario.isPayable && customScenario.isPayable ? customScenario.totalInterestCents : 0);

  const monthsSaved =
    minScenario.isPayable && customScenario.isPayable
      ? Math.max(0, minScenario.monthsToPayoff - customScenario.monthsToPayoff)
      : (!minScenario.isPayable && customScenario.isPayable ? 360 : 0);

  return {
    currentBalanceCents,
    aprPercent,
    minPaymentCents,
    suggestedPaymentCents,
    customPaymentCents: activeCustomPayment,
    minScenario,
    suggestedScenario,
    customScenario,
    interestSavedCents,
    monthsSaved
  };
}
