"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActivityList } from "../_components/ActivityList";
import { Message } from "../_components/Message";
import type { UiItem } from "../types";
import { PRODUCT_NAME } from "pro-harness-shared";

type Loaded = {
  id: string;
  meta: { prompt: string; createdAt: string; finishedAt?: string; error?: string };
  items: UiItem[];
  answer?: string;
  eventsCount: number;
};

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
      <div className="app">
        <div className="header">
          <a className="brand" href="/" aria-label={`${PRODUCT_NAME} home`}>
            {PRODUCT_NAME}
          </a>
        </div>
        <div className="thread">
          <Message role="assistant">
            <div className="err">{err}</div>
          </Message>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <div className="header">
          <a className="brand" href="/" aria-label={`${PRODUCT_NAME} home`}>
            {PRODUCT_NAME}
          </a>
        </div>
        <div className="thread">
          <Message role="assistant">
            <div className="muted">Loading…</div>
          </Message>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <a className="brand" href="/" aria-label={`${PRODUCT_NAME} home`}>
          {PRODUCT_NAME}
        </a>
        <a className="ghostBtn" href="/" aria-label="New run">
          New
        </a>
      </div>

      <div className="thread" aria-label="thread">
        <Message role="user">
          <div style={{ whiteSpace: "pre-wrap" }}>{data.meta.prompt}</div>
        </Message>

        <Message role="assistant">
          <ActivityList items={data.items} running={!data.meta.finishedAt && !data.meta.error} />

          {data.meta.error ? <div className="err">{data.meta.error}</div> : null}

          {data.answer ? (
            <div className="md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.answer}</ReactMarkdown>
            </div>
          ) : (
            <div className="muted">No answer recorded yet.</div>
          )}
        </Message>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
