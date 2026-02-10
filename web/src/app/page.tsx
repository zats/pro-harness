"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Globe, Loader2 } from "lucide-react";

type UiCitation = {
  domain: string;
  url: string;
  faviconUrl: string;
  title?: string;
};

type UiItem = {
  id: string;
  kind: "thought" | "search";
  title: string;
  body?: string;
  citations?: UiCitation[];
  moreCount?: number;
};

type AnyEvent =
  | { type: "ui_item"; item: UiItem }
  | { type: "ui_patch"; id: string; patch: Partial<UiItem> }
  | { type: "convo_id"; id: string }
  | { type: "final_answer"; text: string }
  | { type: "error"; message: string };

function Marker({ kind, spinning }: { kind: UiItem["kind"]; spinning?: boolean }) {
  if (kind === "search") return <Globe size={18} color="rgba(11,18,32,0.55)" />;
  return <span className="dot" />;
}

export default function HomePage() {
  const [prompt, setPrompt] = useState("Search for the latest information about healthy fruits and cite sources.");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<UiItem[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [convoId, setConvoId] = useState<string>("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const lastTitle = useMemo(() => items.at(-1)?.title ?? "", [items]);

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, answer, autoScroll]);

  async function run() {
    setError("");
    setAnswer("");
    setItems([]);
    setRunning(true);
    setConvoId("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, verbosity: 1, summarizeUi: true }),
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
    <div className="wrap">
      <div className="top">
        <div>
          <div className="title">pro-harness</div>
          <div className="sub">A minimal, human-readable trace.</div>
        </div>
        <div className="row">
          <button className={`btn btnPrimary`} onClick={run} disabled={running}>
            {running ? "Running" : "Run"}
          </button>
          <button className={`btn btnDanger`} onClick={stop} disabled={!running}>
            Stop
          </button>
        </div>
      </div>

      <div className="panel">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={running} />
        <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <div className="muted">
            {convoId ? (
              <>
                <a href={`/${encodeURIComponent(convoId)}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <code>{convoId}</code>
                </a>
                {" · "}
              </>
            ) : null}
            {running ? (lastTitle ? `Now: ${lastTitle}` : "Working…") : error ? "Error" : "Idle"}
          </div>
          <button className="btn" onClick={() => setAutoScroll((v) => !v)} disabled={!items.length}>
            {autoScroll ? "Lock" : "Follow"}
          </button>
        </div>
        {error ? <div style={{ marginTop: 8, color: "rgba(244,63,94,0.9)", fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</div> : null}
      </div>

      <div className="timeline" aria-label="timeline">
        {items.map((it) => (
          <div key={it.id} className="item">
            <div className="marker">
              <Marker kind={it.kind} />
            </div>
            <h4 className="h">{it.title}</h4>
            {it.citations && it.citations.length ? (
              <div className="chips" aria-label="citations">
                {it.citations.slice(0, 3).map((c) => (
                  <a key={c.url} className="chip" href={c.url} target="_blank" rel="noreferrer" title={c.url}>
                    <img src={c.faviconUrl} alt="" />
                    {c.domain}
                  </a>
                ))}
                {it.moreCount && it.moreCount > 0 ? <span className="chip">{it.moreCount} more</span> : null}
              </div>
            ) : null}
            {it.body ? <div className="p">{it.body}</div> : null}
          </div>
        ))}
        {running ? (
          <div className="item">
            <div className="marker">
              <Loader2 size={18} color="rgba(11,18,32,0.45)" className="spin" />
            </div>
            <h4 className="h">Working</h4>
            <div className="p">…</div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="answer">
        <h3>Answer</h3>
        {answer ? (
          <div className="answerBody">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
          </div>
        ) : (
          <div className="muted">Run the harness to see an answer.</div>
        )}
      </div>
    </div>
  );
}
