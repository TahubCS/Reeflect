import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import { loadBudgets } from "./load";
import {
  copyBudgetsAction,
  removeBudgetAction,
  saveBudgetAction,
} from "./actions";
import { todayInZone } from "../domain/months";
const empty = { errors: {} };
const month = () => todayInZone(new Date()).slice(0, 7);
export const BUDGET_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "loadBudgets",
    minimumRole: "viewer",
    call: ({ workspaceId }) => loadBudgets(workspaceId),
  },
  {
    name: "saveBudgetAction",
    minimumRole: "editor",
    call: ({ workspaceId, categoryId }) => {
      const form = new FormData();
      form.set("amount", "12.34");
      return saveBudgetAction(workspaceId, month(), categoryId, empty, form);
    },
  },
  {
    name: "removeBudgetAction",
    minimumRole: "editor",
    call: ({ workspaceId, categoryId }) =>
      removeBudgetAction(
        workspaceId,
        month(),
        categoryId,
        empty,
        new FormData(),
      ),
  },
  {
    name: "copyBudgetsAction",
    minimumRole: "editor",
    call: ({ workspaceId }) =>
      copyBudgetsAction(workspaceId, month(), empty, new FormData()),
  },
];
