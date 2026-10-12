export function calculateCompoundInterest(
  principal: number,
  annualRate: number,
  timeYears: number
) {
  if (principal <= 0) {
    throw new Error("Principal must be greater than 0");
  }

  if (annualRate < 0) {
    throw new Error("Interest rate cannot be negative");
  }

  if (timeYears <= 0) {
    throw new Error("Time must be greater than 0");
  }

  const rate = annualRate / 100;
  const totalAmount = principal * Math.pow(1 + rate, timeYears);
  const compoundInterest = totalAmount - principal;

  return {
    principal,
    annualRate,
    timeYears,
    compoundInterest,
    totalAmount,
  };
}
