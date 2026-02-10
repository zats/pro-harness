"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Bug,
  Calculator,
  CircleDollarSign,
  FileText,
  FlaskConical,
  Globe,
  Loader2,
  Search,
  TerminalSquare,
  TextQuote,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";

type AnyEvent = Record<string, any> & { type: string; elapsedMs?: number };

function fmtElapsed(ms?: number) {
  if (ms === undefined) return "";
  const s = Math.max(0, Math.floor(ms / 1000));
  const ss = s % 60;
  const m = Math.floor(s / 60) % 60;
  const h = Math.floor(s / 3600);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m${String(ss).padStart(2, "0")}s`;
  if (m > 0) return `${m}m${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

function fmtUsd(v?: number) {
  if (v === undefined) return "";
  if (v > 0 && v < 0.01) return "$<0.01";
  return `$${v.toFixed(2)}`;
}

function iconFor(e: AnyEvent) {
  const t = String(e.type ?? "");
  const title = String(e.title ?? "");
  const stepId = String(e.stepId ?? "");

  if (t === "run_start") return <Activity size={18} color="rgba(103,232,249,0.9)" />;
  if (t === "run_end") return <BadgeCheck size={18} color="rgba(134,239,172,0.9)" />;
      if (t === "final_answer") return <FileText size={18} color="rgba(103,232,249,0.9)" />;
      if (t === "error") return <TriangleAlert size={18} color="rgba(251,191,36,0.95)" />;
      if (t === "budget_update") return <CircleDollarSign size={18} color="rgba(255,255,255,0.75)" />;

  if (title.toLowerCase().includes("web search") || stepId.includes("web_search") || stepId.includes("extra:web_search") || stepId.includes("bootstrap:web_search")) {
    return <Search size={18} color="rgba(103,232,249,0.9)" />;
  }
  if (title.toLowerCase().includes("execute") && String(e.detail ?? "").includes("python")) return <TerminalSquare size={18} color="rgba(255,255,255,0.85)" />;
  if (title.toLowerCase().includes("verify")) return <FlaskConical size={18} color="rgba(134,239,172,0.9)" />;
  if (title.toLowerCase().includes("critique")) return <Bug size={18} color="rgba(251,113,133,0.9)" />;
  if (title.toLowerCase().includes("polish")) return <WandSparkles size={18} color="rgba(255,255,255,0.85)" />;
  if (title.toLowerCase().includes("planning")) return <Globe size={18} color="rgba(255,255,255,0.85)" />;
      if (t === "ui_summary") return <TextQuote size={18} color="rgba(255,255,255,0.85)" />;
  if (t === "math") return <Calculator size={18} color="rgba(255,255,255,0.85)" />;
  if (t === "step_start") return <Loader2 className="spin" size={18} color="rgba(255,255,255,0.85)" />;
  return <Activity size={18} color="rgba(255,255,255,0.75)" />;
}

function clampVerbosity(v: number): 0 | 1 | 2 | 3 {
  if (v <= 0) return 0;
  if (v === 1) return 1;
  if (v === 2) return 2;
  return 3;
}

export default function HomePage() {
  const [prompt, setPrompt] = useState(
    "Explain what this harness does, how it uses web_search + python, and how the step budget works. Keep it tight.",
  );
  const [verbosity, setVerbosity] = useState<0 | 1 | 2 | 3>(1);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<AnyEvent[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const latest = useMemo(() => {
    const lastStep = [...events].reverse().find((e) => e.type === "step_start" || e.type === "step_end");
    const budget = [...events].reverse().find((e) => e.type === "budget_update");
    const end = [...events].reverse().find((e) => e.type === "run_end");
    return { lastStep, budget, end };
  }, [events]);

  useEffect(() => {
    if (!autoScroll) return;
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events, autoScroll]);

  async function run() {
    setError("");
    setAnswer("");
    setEvents([]);
    setRunning(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, verbosity, summarizeUi: true }),
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

        // SSE framing: lines beginning with "data:"; blank line terminates an event.
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
            } else {
              setEvents((prev) => [...prev, evt]);
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
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <WandSparkles size={20} color="rgba(103,232,249,0.9)" />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: 0.2 }}>pro-harness</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Run the harness, watch it think in steps, keep it honest.
            </div>
          </div>
        </div>
        <div className="badge">Next.js UI</div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <div style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: 0.3 }}>Run</div>
          </div>
          <div className="cardBody">
            <div className="labelRow">
              <div className="label">Prompt</div>
              <div className="row">
                <span className="label">Verbosity</span>
                <div className="seg" aria-label="verbosity">
                  {[0, 1, 2, 3].map((v) => (
                    <button key={v} onClick={() => setVerbosity(clampVerbosity(v))} data-on={verbosity === v}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={running} />
            <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <div className="row">
                <button className={`btn ${running ? "" : "btnPrimary"}`} onClick={run} disabled={running}>
                  {running ? "Running..." : "Run"}
                </button>
                <button className="btn btnDanger" onClick={stop} disabled={!running}>
                  Stop
                </button>
              </div>
              <div className="row">
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                  <span className="label">Auto-scroll</span>
                </label>
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
                  <span className="label">Show raw</span>
                </label>
              </div>
            </div>

            <div className="kv">
              <div>Status</div>
              <div>{running ? "running" : "idle"}</div>
              <div>Last step</div>
              <div>{latest.lastStep ? `${latest.lastStep.title ?? latest.lastStep.type}` : "-"}</div>
              <div>Elapsed</div>
              <div>{latest.end?.elapsedMs !== undefined ? fmtElapsed(latest.end.elapsedMs) : events.length ? fmtElapsed(events[events.length - 1]?.elapsedMs) : "-"}</div>
              <div>Cost</div>
              <div>{events.length ? fmtUsd(events[events.length - 1]?.costSoFarUsd) || "-" : "-"}</div>
            </div>

            {error ? (
              <div style={{ marginTop: 12, color: "rgba(251,113,133,0.95)", fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: 0.3 }}>Steps</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {events.length} events
              </div>
            </div>
          </div>
          <div className="cardBody">
            <div className="timeline">
              {events.map((e, idx) => {
                const time = fmtElapsed(e.elapsedMs);
                const cost = fmtUsd(e.costSoFarUsd);
                const strong = e.type === "step_start" || e.type === "step_end" || e.type === "run_end";

                const body =
                  e.type === "step_start"
                    ? String(e.detail ?? "")
                    : e.type === "step_end"
                      ? String(e.learned ?? "")
                      : e.type === "ui_summary"
                        ? String(e.text ?? "")
                      : e.type === "step_detail"
                        ? String(e.message ?? "")
                        : showRaw
                          ? JSON.stringify(e, null, 2)
                          : "";

                const title =
                  e.type === "step_start" || e.type === "step_end" || e.type === "step_detail"
                    ? String(e.title ?? e.type)
                    : e.type === "ui_summary"
                      ? "Summary"
                    : e.type === "run_start"
                      ? "Run started"
                      : e.type === "budget_update"
                        ? "Budget update"
                        : e.type === "run_end"
                          ? "Run finished"
                          : String(e.type);

                // Filter low-signal noise in non-raw mode.
                if (!showRaw && e.type === "budget_update") return null;
                if (!showRaw && e.type === "step_detail" && (verbosity ?? 0) < Number(e.level ?? 1)) return null;

                return (
                  <div key={idx} className={`event ${strong ? "eventStrong" : ""}`}>
                    <div style={{ paddingTop: 2 }}>{iconFor(e)}</div>
                    <div>
                      <div className="eventTitle">
                        <h4>{title}</h4>
                        <div className="meta">
                          {time ? time : ""} {cost ? ` · ${cost}` : ""}
                        </div>
                      </div>
                      {body ? <div className="eventBody">{body}</div> : null}
                    </div>
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </div>
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="cardHeader">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: 0.3 }}>Answer</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {answer ? `${answer.length} chars` : "—"}
              </div>
            </div>
          </div>
          <div className="cardBody">
            {answer ? <div className="answer">{answer}</div> : <div className="muted">Run the harness to see an answer.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
