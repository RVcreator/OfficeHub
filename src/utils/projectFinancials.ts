import type {Project} from '../types';
export const parseDollar = (val?: string | number): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return Number(String(val).replace(/[^0-9.-]+/g, '')) || 0;
};

export const getProjectFinancials = (p: Project) => {
  const baseBudget = parseDollar(p.budget);
  const catAlloc = (p.budgetBreakdown || []).reduce((sum, c) => sum + (Number(c.allocated) || 0), 0);
  const alloc = baseBudget > 0 ? Math.max(baseBudget, catAlloc) : catAlloc;

  const activeExpenses = (p.expenses || []).filter(e => e.status === 'Active');
  const expensesSpent = activeExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const baseSpent = parseDollar(p.spent);
  const catSpent = (p.budgetBreakdown || []).reduce((sum, c) => sum + (Number(c.spent) || 0), 0);
  const spent = (p.expenses && p.expenses.length > 0)
    ? expensesSpent
    : (baseSpent > 0 ? baseSpent : catSpent);

  const remaining = alloc - spent;
  const burnPct = alloc > 0 ? Math.round((spent / alloc) * 100) : (spent > 0 ? 100 : 0);

  return { alloc, spent, remaining, burnPct };
};

