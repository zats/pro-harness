"use client";

import { Globe, Loader2 } from "lucide-react";
import type { UiItem } from "../types";

function Marker({ kind }: { kind: UiItem["kind"] }) {
  if (kind === "search") return <Globe size={16} color="rgba(11,18,32,0.55)" />;
  return <span className="dot" />;
}

export function ActivityList({ items, running }: { items: UiItem[]; running?: boolean }) {
  if (!items.length && !running) return null;
  return (
    <div className="activity" aria-label="activity">
      {items.map((it) => (
        <div key={it.id} className="activityItem">
          <div className="activityGutter" aria-hidden="true">
            <div className="activityMarker">
              <Marker kind={it.kind} />
            </div>
          </div>
          <div className="activityContent">
            <div className="activityTitle">{it.title}</div>
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
            {it.body ? <div className="activityBody">{it.body}</div> : null}
          </div>
        </div>
      ))}

      {running ? (
        <div className="activityItem">
          <div className="activityGutter" aria-hidden="true">
            <div className="activityMarker">
              <Loader2 size={16} color="rgba(11,18,32,0.45)" className="spin" />
            </div>
          </div>
          <div className="activityContent">
            <div className="activityTitle">Working…</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

