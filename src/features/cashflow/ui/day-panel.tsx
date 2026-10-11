"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { type FormEvent, useId, useState, useTransition } from "react";
import type { AccountChoice } from "@/features/transactions";
import { formatCents, formatSigned, parseDollars } from "@/lib/money";
import type { DayView, Item } from "../domain/cashflow";
import { formatLong, formatShort } from "../domain/dates";
import { addDayEntryAction, removeDayEntryAction } from "../server/actions";
import type { DashboardCategory } from "../server/load";
import { KIND_LABEL, Mark, SOURCE_LABEL } from "./month-grid";

/** Lets the saved rules pick the category (ADR-013). */
const AUTOMATIC = "";

function itemNote(item: Item, cancelling: boolean) {
  const what = item.kind === "everyday" ? item.category : KIND_LABEL[item.kind];
  if (cancelling) return `${what}, planning to cancel`;
  if (!item.source) return `${what}, expected`;
  const parts = [`${what}, ${SOURCE_LABEL[item.source]}`];
  if (item.onCard) parts.push("on card");
  const note = parts.join(", ");
  return item.accountName ? `${note} · ${item.accountName}` : note;
}

/** Checking first, so a new entry lands where most spending happens. */
function defaultAccount(accounts: readonly AccountChoice[]) {
  return (accounts.find((a) => a.type === "checking") ?? accounts[0])?.id ?? "";
}

function AddForm({
  workspaceId,
  day,
  accounts,
  categories,
}: {
  workspaceId: string;
  day: DayView;
  accounts: readonly AccountChoice[];
  categories: readonly DashboardCategory[];
}) {
  const [isIncome, setIsIncome] = useState(false);
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [accountId, setAccountId] = useState(() => defaultAccount(accounts));
  const [categoryId, setCategoryId] = useState(AUTOMATIC);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const ids = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!parseDollars(amountText)) {
      setError("Enter an amount like 12.50.");
      return;
    }
    const chosen = categories.find((c) => c.id === categoryId);
    const description =
      name.trim() || (isIncome ? "Money in" : (chosen?.name ?? "Spending"));
    startTransition(async () => {
      const result = await addDayEntryAction(workspaceId, {
        accountId,
        postedOn: day.date,
        direction: isIncome ? "in" : "out",
        amount: amountText,
        description,
        categoryId: isIncome || !chosen ? null : chosen.id,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setName("");
      setAmountText("");
      setError("");
    });
  };

  return (
    <form className="add" onSubmit={submit} noValidate>
      <h3>Add something to this day</h3>
      <div className="switch" role="radiogroup" aria-label="Type">
        <label>
          <input
            type="radio"
            name="direction"
            checked={!isIncome}
            onChange={() => setIsIncome(false)}
          />
          <span>I spent</span>
        </label>
        <label>
          <input
            type="radio"
            name="direction"
            checked={isIncome}
            onChange={() => setIsIncome(true)}
          />
          <span>I got</span>
        </label>
      </div>
      <div className="fields">
        <label className="field field-amount">
          <span>How much?</span>
          <span className="money-input">
            <span aria-hidden="true">$</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "amount-error" : undefined}
            />
          </span>
        </label>
        <label className="field">
          <span>What was it for?</span>
          <input
            placeholder={
              isIncome ? "Refund, gift, side job" : "Lunch, bus fare"
            }
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {!isIncome && (
          <div className="field">
            <label htmlFor={`${ids}-category`}>Category</label>
            <select
              id={`${ids}-category`}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value={AUTOMATIC}>Choose for me</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {accounts.length > 1 && (
          <div className="field">
            <label htmlFor={`${ids}-account`}>Account</label>
            <select
              id={`${ids}-account`}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error && (
        <p id="amount-error" className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={pending}>
        {pending ? "Adding…" : `Add to ${formatShort(day.date)}`}
      </button>
    </form>
  );
}

export function DayPanel({
  workspaceId,
  day,
  accounts,
  categories,
  canEdit,
  cancelPlans,
}: {
  workspaceId: string;
  day: DayView;
  accounts: readonly AccountChoice[];
  categories: readonly DashboardCategory[];
  canEdit: boolean;
  cancelPlans: ReadonlySet<string>;
}) {
  const [removing, startRemoving] = useTransition();
  const remove = (id: string) =>
    startRemoving(() => removeDayEntryAction(workspaceId, id));

  return (
    <aside className="panel" aria-label="Selected day" aria-busy={removing}>
      <motion.div
        key={day.date}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <p className="panel-when">
          {day.isToday ? "Today" : day.isFuture ? "Coming up" : "Earlier"}
        </p>
        <h2>{formatLong(day.date)}</h2>

        <dl className="panel-totals">
          <div>
            <dt>Money in</dt>
            <dd>{formatCents(day.moneyIn)}</dd>
          </div>
          <div>
            <dt>Money out</dt>
            <dd>{formatCents(day.moneyOut)}</dd>
          </div>
          <div>
            <dt>{day.isFuture ? "Expected balance" : "Balance after"}</dt>
            <dd>{formatCents(day.endBalance)}</dd>
          </div>
        </dl>

        {day.items.length === 0 ? (
          <p className="panel-empty">
            {day.isFuture
              ? "Nothing expected on this day yet."
              : "Nothing went in or out. A no-spend day."}
          </p>
        ) : (
          <ul className="items">
            {day.items.map((item) => {
              const cancelling =
                !!item.recurringId && cancelPlans.has(item.recurringId);
              return (
                <li key={item.id}>
                  <Mark kind={item.kind} />
                  <span className="item-text">
                    <span
                      className={
                        cancelling ? "item-name item-cancelling" : "item-name"
                      }
                    >
                      {item.name}
                    </span>
                    <span className="item-note">
                      {itemNote(item, cancelling)}
                    </span>
                  </span>
                  <span
                    className={
                      item.amount > 0
                        ? "item-amount item-amount-in"
                        : "item-amount"
                    }
                  >
                    {formatSigned(item.amount)}
                  </span>
                  {item.recurringId ? (
                    <span className="item-remove" />
                  ) : canEdit && item.removable ? (
                    <button
                      type="button"
                      className="item-remove"
                      aria-label={`Remove ${item.name}`}
                      disabled={removing}
                      onClick={() => remove(item.id)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  ) : (
                    <Link
                      className="item-remove"
                      href={`/w/${workspaceId}/transactions/${item.id}`}
                      aria-label={`Open ${item.name}`}
                    >
                      <span aria-hidden="true">›</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit &&
          (day.isFuture ? (
            <p className="add-note">
              You can add spending up to today. Paydays and bills still to come
              will show here once we&rsquo;ve seen them repeat.
            </p>
          ) : (
            <AddForm
              workspaceId={workspaceId}
              day={day}
              accounts={accounts}
              categories={categories}
            />
          ))}
      </motion.div>
    </aside>
  );
}
