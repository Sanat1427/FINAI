export function calculateSimpleInterest(
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

  const simpleInterest = (principal * annualRate * timeYears) / 100;
  const totalAmount = principal + simpleInterest;

  return {
    principal,
    annualRate,
    timeYears,
    simpleInterest,
    totalAmount,
  };
}
