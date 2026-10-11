// Authorized web read and actions. Trusted service consumers authorize first
// before using readBudgetMonth; they must never take a workspace from model text.
export { loadBudgets, type BudgetsView } from "./server/load";
export { readBudgetMonth } from "./server/repository";
export {
  saveBudgetAction,
  removeBudgetAction,
  copyBudgetsAction,
} from "./server/actions";
export { BudgetsPage } from "./ui/budgets-page";
