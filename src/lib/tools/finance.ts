export function calculateEMI(
  principal: number,
  annualRate: number,
  tenureYears: number
) {
  if (principal <= 0) {
    throw new Error("Principal must be greater than 0");
  }

  if (annualRate < 0) {
    throw new Error("Interest rate cannot be negative");
  }

  if (tenureYears <= 0) {
    throw new Error("Tenure must be greater than 0");
  }

  const monthlyRate = annualRate / 12 / 100;
  const numberOfMonths = tenureYears * 12;

  if (monthlyRate === 0) {
    return {
      emi: principal / numberOfMonths,
      totalPayment: principal,
      totalInterest: 0,
    };
  }

  const emi =
    (principal *
      monthlyRate *
      Math.pow(1 + monthlyRate, numberOfMonths)) /
    (Math.pow(1 + monthlyRate, numberOfMonths) - 1);

  const totalPayment = emi * numberOfMonths;
  const totalInterest = totalPayment - principal;

  return {
    emi,
    totalPayment,
    totalInterest,
  };
}