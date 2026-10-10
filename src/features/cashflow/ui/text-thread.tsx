"use client";

import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { APP_NAME } from "@/config/app";

type Message = { from: "you" | "app"; text: string };

const SUGGESTIONS = [
  "spent 12 on lunch",
  "how am I doing?",
  "got 40 from a refund",
];

/** A stand-in for the iMessage thread: what you send lands on the calendar. */
export function TextThread({ onSend }: { onSend: (text: string) => string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "app",
      text: `Hi, it's ${APP_NAME}. Tell me what you spent, or ask how you're doing.`,
    },
  ]);
  const [draft, setDraft] = useState("");

  const send = (text: string) => {
    const message = text.trim();
    if (!message) return;
    const reply = onSend(message);
    setMessages((current) => [
      ...current.slice(-6),
      { from: "you", text: message },
      { from: "app", text: reply },
    ]);
    setDraft("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  return (
    <div className="thread">
      <ol className="thread-messages" aria-live="polite">
        {messages.map((message, i) => (
          <motion.li
            key={`${messages.length}-${i}`}
            className={`bubble bubble-${message.from}`}
            initial={
              i >= messages.length - 2 && messages.length > 1
                ? { opacity: 0, y: 8 }
                : false
            }
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              delay: message.from === "app" ? 0.15 : 0,
            }}
          >
            <span className="sr-only">
              {message.from === "you" ? "You: " : `${APP_NAME}: `}
            </span>
            {message.text}
          </motion.li>
        ))}
      </ol>
      <div className="thread-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => send(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form className="thread-form" onSubmit={submit}>
        <input
          aria-label={`Message to ${APP_NAME}`}
          placeholder="Text a message"
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="primary">
          Send
        </button>
      </form>
    </div>
  );
}
