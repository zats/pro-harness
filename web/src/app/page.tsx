"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Square } from "lucide-react";
import { ActivityList } from "./_components/ActivityList";
import { Message } from "./_components/Message";
import type { UiItem } from "./types";
import { PRODUCT_NAME } from "pro-harness-shared";

type AnyEvent =
  | { type: "ui_item"; item: UiItem }
  | { type: "ui_patch"; id: string; patch: Partial<UiItem> }
  | { type: "convo_id"; id: string }
  | { type: "final_answer"; text: string }
  | { type: "error"; message: string };

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [sentPrompt, setSentPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<UiItem[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [convoId, setConvoId] = useState<string>("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, answer, error, running]);

  async function run() {
    setError("");
    setAnswer("");
    setItems([]);
    setRunning(true);
    setConvoId("");
    const input = prompt.trim();
    setSentPrompt(input);
    setPrompt("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: input, verbosity: 1, summarizeUi: true }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const txt = await res.text();
        throw new Error(txt || `Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        while (true) {
          const sep = buf.indexOf("\n\n");
          if (sep < 0) break;
          const chunk = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const lines = chunk.split("\n").map((l) => l.trim());
          for (const l of lines) {
            if (!l.startsWith("data:")) continue;
            const json = l.slice("data:".length).trim();
            if (!json) continue;
            const evt = JSON.parse(json) as AnyEvent;

            if (evt.type === "final_answer") {
              setAnswer(String(evt.text ?? ""));
            } else if (evt.type === "error") {
              setError(String(evt.message ?? "Unknown error"));
            } else if (evt.type === "convo_id") {
              const id = String(evt.id ?? "");
              if (id) {
                setConvoId(id);
                // Update URL without navigating (keeps stream alive). Reload will open /{id}.
                window.history.replaceState({}, "", `/${encodeURIComponent(id)}`);
              }
            } else if (evt.type === "ui_item") {
              setItems((prev) => [...prev, evt.item]);
            } else if (evt.type === "ui_patch") {
              setItems((prev) => prev.map((it) => (it.id === evt.id ? { ...it, ...evt.patch } : it)));
            }
          }
        }
      }
    } catch (e: any) {
      if (String(e?.name) === "AbortError") return;
      setError(String(e?.message ?? e));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }

  return (
    <div className="app">
      <div className="header">
        <a className="brand" href="/" aria-label={`${PRODUCT_NAME} home`}>
          {PRODUCT_NAME}
        </a>
      </div>

      <div className="thread" aria-label="thread">
        {sentPrompt ? (
          <Message role="user">
            <div style={{ whiteSpace: "pre-wrap" }}>{sentPrompt}</div>
          </Message>
        ) : null}

        {sentPrompt && (running || items.length > 0 || Boolean(answer) || Boolean(error)) ? (
          <Message role="assistant">
            <ActivityList items={items} running={running} />

            {error ? <div className="err">{error}</div> : null}

            {answer ? (
              <div className="md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
              </div>
            ) : null}
          </Message>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="composer" aria-label="composer">
        <form
          className="composerInner"
          onSubmit={(e) => {
            e.preventDefault();
            if (running) return;
            if (!prompt.trim()) return;
            run();
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={running}
            placeholder={`Message ${PRODUCT_NAME}…`}
          />
          <div className="composerActions">
            {running ? (
              <button className="circleBtn" type="button" onClick={stop} aria-label="Stop">
                <Square size={18} />
              </button>
            ) : (
              <button className="circleBtn" type="submit" disabled={!prompt.trim()} aria-label="Run">
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </form>
        {/* Hidden state, but keep around so /{id} works on reload. */}
        <div style={{ display: "none" }}>{convoId}</div>
      </div>
    </div>
  );
}
