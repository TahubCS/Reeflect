import "server-only";
import type { EntryPoint, EntryPointTarget } from "@/lib/auth/entry-point";
import {
  createRuleAction,
  deleteRuleAction,
  renameCategoryAction,
  saveOverrideAction,
  updateRuleAction,
} from "./actions";

function ruleForm(categoryId: string): FormData {
  const form = new FormData();
  form.set("pattern", "Isolation merchant");
  form.set("categoryId", categoryId);
  form.set("matchType", "contains");
  form.set("priority", "100");
  return form;
}

const EMPTY = { errors: {} };
const overrideForm = (target: EntryPointTarget) => {
  const form = ruleForm(target.categoryId);
  form.set("mode", "manual");
  return form;
};

export const CATEGORIZATION_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "saveOverrideAction",
    minimumRole: "editor",
    call: (target) =>
      saveOverrideAction(
        target.workspaceId,
        target.transactionId,
        EMPTY,
        overrideForm(target),
      ),
  },
  {
    name: "createRuleAction",
    minimumRole: "editor",
    call: (target) =>
      createRuleAction(target.workspaceId, EMPTY, ruleForm(target.categoryId)),
  },
  {
    name: "updateRuleAction",
    minimumRole: "editor",
    call: (target) =>
      updateRuleAction(
        target.workspaceId,
        target.ruleId,
        EMPTY,
        ruleForm(target.categoryId),
      ),
  },
  {
    name: "deleteRuleAction",
    minimumRole: "editor",
    call: (target) =>
      deleteRuleAction(
        target.workspaceId,
        target.ruleId,
        EMPTY,
        new FormData(),
      ),
  },
  {
    name: "renameCategoryAction",
    minimumRole: "editor",
    call: (target) => {
      const form = new FormData();
      form.set("name", "Isolation category");
      return renameCategoryAction(
        target.workspaceId,
        target.categoryId,
        EMPTY,
        form,
      );
    },
  },
];
