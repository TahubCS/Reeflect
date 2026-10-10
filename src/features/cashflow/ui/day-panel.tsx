"use client";

import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import {
  type Cents,
  formatCents,
  formatSigned,
  negate,
  parseDollars,
} from "@/lib/money";
import type { DayView, Item } from "../domain/cashflow";
import { formatLong, formatShort } from "../domain/dates";
import { SPENDING_CATEGORIES } from "../domain/demo-data";
import { KIND_LABEL, Mark, SOURCE_LABEL } from "./month-grid";

export type NewEntry = {
  name: string;
  amount: Cents;
  category: string;
  isIncome: boolean;
};

function itemNote(item: Item, cancelling: boolean) {
  const what = item.kind === "everyday" ? item.category : KIND_LABEL[item.kind];
  if (cancelling) return `${what}, planning to cancel`;
  if (!item.source) return `${what}, expected`;
  if (item.planned) return `${what}, planned by you`;
  return `${what}, ${SOURCE_LABEL[item.source]}`;
}

function AddForm({
  day,
  onAdd,
}: {
  day: DayView;
  onAdd: (entry: NewEntry) => void;
}) {
  const [isIncome, setIsIncome] = useState(false);
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState(SPENDING_CATEGORIES[0]);
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = parseDollars(amountText);
    if (!amount) {
      setError("Enter an amount like 12.50.");
      return;
    }
    onAdd({
      name: name.trim() || (isIncome ? "Money in" : category),
      amount: isIncome ? amount : negate(amount),
      category: isIncome ? "Pay" : category,
      isIncome,
    });
    setName("");
    setAmountText("");
    setError("");
  };

  return (
    <form className="add" onSubmit={submit} noValidate>
      <h3>
        {day.isFuture
          ? "Plan something for this day"
          : "Add something to this day"}
      </h3>
      <div className="switch" role="radiogroup" aria-label="Type">
        <label>
          <input
            type="radio"
            name="direction"
            checked={!isIncome}
            onChange={() => setIsIncome(false)}
          />
          <span>{day.isFuture ? "I will spend" : "I spent"}</span>
        </label>
        <label>
          <input
            type="radio"
            name="direction"
            checked={isIncome}
            onChange={() => setIsIncome(true)}
          />
          <span>{day.isFuture ? "I will get" : "I got"}</span>
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
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {!isIncome && (
          <label className="field">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {SPENDING_CATEGORIES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <p id="amount-error" className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary">
        Add to {formatShort(day.date)}
      </button>
    </form>
  );
}

export function DayPanel({
  day,
  cancelPlans,
  onAdd,
  onRemove,
}: {
  day: DayView;
  cancelPlans: ReadonlySet<string>;
  onAdd: (entry: NewEntry) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <aside className="panel" aria-label="Selected day">
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
              ? "Nothing planned for this day yet."
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
                  ) : (
                    <button
                      type="button"
                      className="item-remove"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => onRemove(item.id)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <AddForm day={day} onAdd={onAdd} />
      </motion.div>
    </aside>
  );
}
