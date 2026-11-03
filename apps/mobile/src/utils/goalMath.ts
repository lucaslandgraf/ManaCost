export interface GoalEstimateResult {
  monthsNeeded: number;
  yearsMonthsText: string;
  completionDate: Date;
  totalInvested: number;
  totalInterest: number;
}

export function calculateGoalProjection(
  targetAmount: number,
  currentAmount: number,
  monthlyDeposit: number,
  annualRatePct: number = 0
): GoalEstimateResult {
  const remainingTarget = Math.max(0, targetAmount - currentAmount);

  if (remainingTarget === 0) {
    return {
      monthsNeeded: 0,
      yearsMonthsText: 'Meta atingida!',
      completionDate: new Date(),
      totalInvested: currentAmount,
      totalInterest: 0,
    };
  }

  if (monthlyDeposit <= 0) {
    return {
      monthsNeeded: Infinity,
      yearsMonthsText: 'Indefinido (aporte zero)',
      completionDate: new Date(),
      totalInvested: currentAmount,
      totalInterest: 0,
    };
  }

  let months = 0;
  let balance = currentAmount;
  let totalInvested = currentAmount;
  const monthlyRate = annualRatePct > 0 ? Math.pow(1 + annualRatePct / 100, 1 / 12) - 1 : 0;

  // Limite de segurança de 600 meses (50 anos) para evitar loops infinitos
  while (balance < targetAmount && months < 600) {
    balance = balance * (1 + monthlyRate) + monthlyDeposit;
    totalInvested += monthlyDeposit;
    months++;
  }

  const completionDate = new Date();
  completionDate.setMonth(completionDate.getMonth() + months);

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  let text = '';
  if (years > 0) text += `${years} ano${years > 1 ? 's' : ''}`;
  if (remainingMonths > 0) {
    text += years > 0 ? ` e ${remainingMonths} m${remainingMonths > 1 ? 'eses' : 'ês'}` : `${remainingMonths} m${remainingMonths > 1 ? 'eses' : 'ês'}`;
  }

  return {
    monthsNeeded: months,
    yearsMonthsText: text || 'Menos de 1 mês',
    completionDate,
    totalInvested,
    totalInterest: Math.max(0, balance - totalInvested),
  };
}