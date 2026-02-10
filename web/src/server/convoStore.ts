import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type StoredEvent = Record<string, any> & { type: string; ts: string };

export type ConvoMeta = {
  id: string;
  createdAt: string;
  prompt: string;
  finishedAt?: string;
  error?: string;
};

export type ConvoState = {
  id: string;
  meta: ConvoMeta;
  items: any[];
  answer?: string;
  eventsCount: number;
};

function nowIso() {
  return new Date().toISOString();
}

function dataDir() {
  // Keep run artifacts out of git, under web/.data.
  return path.resolve(process.cwd(), ".data", "conversations");
}

function assertSafeId(id: string) {
  // Prevent path traversal. IDs are generated via randomUUID().
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("invalid_conversation_id");
  }
}

function convoDir(id: string) {
  assertSafeId(id);
  return path.join(dataDir(), id);
}

function metaPath(id: string) {
  return path.join(convoDir(id), "meta.json");
}

function eventsPath(id: string) {
  return path.join(convoDir(id), "events.jsonl");
}

export function newConversationId() {
  return crypto.randomUUID();
}

export async function initConversation(args: { id: string; prompt: string }) {
  assertSafeId(args.id);
  await fs.mkdir(convoDir(args.id), { recursive: true });
  const meta: ConvoMeta = { id: args.id, createdAt: nowIso(), prompt: args.prompt };
  await fs.writeFile(metaPath(args.id), JSON.stringify(meta, null, 2), "utf8");
}

export async function appendEvent(args: { id: string; event: { type: string; [k: string]: any } }) {
  assertSafeId(args.id);
  await fs.mkdir(convoDir(args.id), { recursive: true });
  const e: StoredEvent = { ...args.event, ts: nowIso() };
  await fs.appendFile(eventsPath(args.id), `${JSON.stringify(e)}\n`, "utf8");
}

export async function finishConversation(args: { id: string; error?: string }) {
  assertSafeId(args.id);
  const mp = metaPath(args.id);
  let meta: ConvoMeta | null = null;
  try {
    meta = JSON.parse(await fs.readFile(mp, "utf8")) as ConvoMeta;
  } catch {
    meta = null;
  }
  if (!meta) return;
  meta.finishedAt = nowIso();
  if (args.error) meta.error = args.error;
  await fs.writeFile(mp, JSON.stringify(meta, null, 2), "utf8");
}

async function readAllEvents(id: string): Promise<StoredEvent[]> {
  const p = eventsPath(id);
  let raw = "";
  try {
    raw = await fs.readFile(p, "utf8");
  } catch {
    return [];
  }
  const out: StoredEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // ignore bad lines
    }
  }
  return out;
}

function applyEvents(events: StoredEvent[]) {
  const items: any[] = [];
  let answer: string | undefined;

  for (const e of events) {
    if (e.type === "ui_item" && e.item) items.push(e.item);
    if (e.type === "ui_patch" && e.id && e.patch) {
      const idx = items.findIndex((x) => x?.id === e.id);
      if (idx >= 0) items[idx] = { ...items[idx], ...e.patch };
    }
    if (e.type === "final_answer" && typeof e.text === "string") answer = e.text;
  }

  return { items, answer };
}

export async function loadConversation(id: string): Promise<ConvoState | null> {
  assertSafeId(id);
  let meta: ConvoMeta;
  try {
    meta = JSON.parse(await fs.readFile(metaPath(id), "utf8")) as ConvoMeta;
  } catch {
    return null;
  }
  const events = await readAllEvents(id);
  const state = applyEvents(events);
  return { id, meta, items: state.items, answer: state.answer, eventsCount: events.length };
}
