"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

const SUGGESTIONS = [
  "What's my biggest source?",
  "How can I reduce it?",
  "How am I doing vs the target?",
];

/** Server-side schema limits (see chatRequestSchema): keep requests valid. */
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm Carbonara. Ask me about your footprint — what's driving it, how you compare to the sustainable target, or simple ways to cut it.",
};

/** Floating, context-aware assistant grounded in the user's footprint. */
export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Keep the latest message in view as the conversation grows.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  // Move focus into the panel when it opens for keyboard users.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on Escape and return focus to the launcher.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next = [...messages, { role: "user", content: trimmed } as ChatMessage];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      // Only send actual conversation turns (skip the local greeting), and
      // only the most recent ones so long chats stay within the API's limit.
      const payload = next.filter((m, i) => !(i === 0 && m === GREETING)).slice(-MAX_MESSAGES);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      const data = await res.json();
      const reply =
        res.ok && data.reply
          ? (data.reply as string)
          : "Sorry, I couldn't answer that just now. Please try again.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong reaching the assistant. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-widget">
      {open && (
        <section
          className="chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-heading"
        >
          <header className="chat-panel-head">
            <h2 id="chat-heading">
              <span className="brand-mark" aria-hidden="true">🌱</span> Ask Carbonara
              <span className="badge-ai" aria-hidden="true">AI</span>
            </h2>
            <button
              type="button"
              className="chat-close"
              onClick={() => {
                setOpen(false);
                launcherRef.current?.focus();
              }}
              aria-label="Close assistant"
            >
              ✕
            </button>
          </header>

          <div
            className="chat-log"
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation"
          >
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                <span className="visually-hidden">
                  {m.role === "user" ? "You said: " : "Assistant said: "}
                </span>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="bubble assistant typing" aria-label="Assistant is typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            )}
          </div>

          <div className="suggestions" role="group" aria-label="Suggested questions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={loading}>
                {s}
              </button>
            ))}
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="chat-text" className="visually-hidden">
              Ask a question about your carbon footprint
            </label>
            <input
              id="chat-text"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your footprint…"
              autoComplete="off"
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={loading}
            />
            <button type="submit" className="primary" disabled={loading || !input.trim()}>
              {loading ? "…" : "Send"}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        ref={launcherRef}
        className="chat-launcher"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? "Close Carbonara assistant" : "Open Carbonara assistant"}
      >
        <span aria-hidden="true">{open ? "✕" : "🌱"}</span>
        {!open && <span className="chat-launcher-text">Ask Carbonara</span>}
      </button>
    </div>
  );
}
