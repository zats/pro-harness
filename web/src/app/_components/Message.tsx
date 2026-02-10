"use client";

import { PropsWithChildren } from "react";

export function Message({ role, children }: PropsWithChildren<{ role: "user" | "assistant" }>) {
  return (
    <div className="msg" data-role={role}>
      <div className="msgInner">{children}</div>
    </div>
  );
}

