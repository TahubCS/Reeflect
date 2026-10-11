# Batch specs

Population specs for `pnpm batch load`, written by following
[docs/SYNTHETIC.md](../../../docs/SYNTHETIC.md). Invented people only.

## devs.json: the developers' own accounts (ADR-082)

Nine one-year histories, three pay levels for each developer. The keys are
`jacob-low|mid|high`, `simon-low|mid|high` and `muhammad-low|mid|high`. Each
developer gets one level in their Personal workspace; swap levels to see
Insights with a different income. Everyone has checking, savings and a
card. Simon's three levels warn "spends more than comes in" because his car
is paid in full in August; that is intended.

| Developer | `user.id` |
|---|---|
| Jacob | `3rM3Xejy41pYbSwyU7Sch19UBOAkHc3J` |
| Simon | `8tatcIdXavT4kqd5TgPQ9I3V1iRifEv6` |
| Muhammad | `bfduAHvMeNIeN8Vtm21VpdnIYqUGXjq5` |

Commands run from the repo root. Production needs `--target production`;
without it they go to the batch-testing branch. Use `--seed devs-1` to get
the rows that were checked.

```bash
# Preview: nothing is written
pnpm batch give scripts/batch/specs/devs.json --seed devs-1 --dry-run --user jacob-mid=3rM3Xejy41pYbSwyU7Sch19UBOAkHc3J --user simon-mid=8tatcIdXavT4kqd5TgPQ9I3V1iRifEv6 --user muhammad-mid=bfduAHvMeNIeN8Vtm21VpdnIYqUGXjq5

# Count each developer's sample accounts in production (read-only without --yes)
pnpm batch take-back --target production --user 3rM3Xejy41pYbSwyU7Sch19UBOAkHc3J --user 8tatcIdXavT4kqd5TgPQ9I3V1iRifEv6 --user bfduAHvMeNIeN8Vtm21VpdnIYqUGXjq5

# Give everyone the middle level. --replace swaps any sample accounts already
# there and does nothing extra when there are none.
pnpm batch give scripts/batch/specs/devs.json --seed devs-1 --target production --yes --replace --user jacob-mid=3rM3Xejy41pYbSwyU7Sch19UBOAkHc3J --user simon-mid=8tatcIdXavT4kqd5TgPQ9I3V1iRifEv6 --user muhammad-mid=bfduAHvMeNIeN8Vtm21VpdnIYqUGXjq5

# Switch one developer to another level
pnpm batch give scripts/batch/specs/devs.json --seed devs-1 --target production --yes --replace --user jacob-high=3rM3Xejy41pYbSwyU7Sch19UBOAkHc3J

# Remove one developer's sample accounts and their transactions
pnpm batch take-back --target production --yes --user 3rM3Xejy41pYbSwyU7Sch19UBOAkHc3J
```

Accounts arrive named "Sample · …" in the Personal workspace. A developer
who looks at another workspace (a team one) won't see them.
