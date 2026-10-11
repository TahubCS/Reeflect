// Where statement CSVs live in the bucket (ADR-053). Every key starts with
// the workspace and the account, so deleting either can remove its files
// by prefix.

export function accountPrefix(workspaceId: string, accountId: string): string {
  return `w/${workspaceId}/a/${accountId}/`;
}

export function statementCsvKey(
  workspaceId: string,
  accountId: string,
  importBatchId: string,
): string {
  return `${accountPrefix(workspaceId, accountId)}${importBatchId}.csv`;
}
