"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Globe } from "lucide-react";

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

type Loaded = {
  id: string;
  meta: { prompt: string; createdAt: string; finishedAt?: string; error?: string };
  items: UiItem[];
  answer?: string;
  eventsCount: number;
};

function Marker({ kind }: { kind: UiItem["kind"] }) {
  if (kind === "search") return <Globe size={18} color="rgba(11,18,32,0.55)" />;
  return <span className="dot" />;
}

export default function ConvoClient({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setErr("");
      const r = await fetch(`/api/convo/${encodeURIComponent(id)}`);
      if (!r.ok) {
        setErr(`Not found: ${id}`);
        return;
      }
      const j = (await r.json()) as Loaded;
      setData(j);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" as any }), 0);
    })().catch((e) => setErr(String((e as any)?.message ?? e)));
  }, [id]);

  if (err) {
    return (
      <div className="wrap">
        <div className="top">
          <div>
            <div className="title">pro-harness</div>
            <div className="sub">Conversation</div>
          </div>
        </div>
        <div className="panel">
          <div style={{ color: "rgba(244,63,94,0.9)", fontSize: 13 }}>{err}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="wrap">
        <div className="top">
          <div>
            <div className="title">pro-harness</div>
            <div className="sub">Loading…</div>
          </div>
        </div>
        <div className="panel">
          <div className="muted">Loading conversation…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="top">
        <div>
          <div className="title">pro-harness</div>
          <div className="sub">
            <code>{data.id}</code> · {data.meta.finishedAt ? "Finished" : "In progress"}
          </div>
        </div>
        <div className="row">
          <a className="btn" href="/" style={{ textDecoration: "none" }}>
            New run
          </a>
        </div>
      </div>

      <div className="panel">
        <div className="muted" style={{ marginBottom: 8 }}>
          Prompt
        </div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.35 }}>{data.meta.prompt}</div>
      </div>

      <div className="timeline" aria-label="timeline">
        {data.items.map((it) => (
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
        <div ref={bottomRef} />
      </div>

      <div className="answer">
        <h3>Answer</h3>
        {data.answer ? (
          <div className="answerBody">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.answer}</ReactMarkdown>
          </div>
        ) : (
          <div className="muted">No answer recorded yet.</div>
        )}
      </div>
    </div>
  );
}
