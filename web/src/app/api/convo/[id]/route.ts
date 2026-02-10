import { loadConversation } from "../../../../server/convoStore";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let state = null;
  try {
    state = await loadConversation(id);
  } catch (e: any) {
    if (String(e?.message) === "invalid_conversation_id") {
      return new Response(JSON.stringify({ error: "invalid_id" }), { status: 400 });
    }
    throw e;
  }
  if (!state) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  return new Response(JSON.stringify(state), { headers: { "content-type": "application/json; charset=utf-8" } });
}
