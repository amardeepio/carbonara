import { NextResponse } from "next/server";
import { chatReply } from "@/lib/assistant";
import { getSessionUser } from "@/lib/session";
import { loadSummary } from "@/lib/summary";
import { chatRequestSchema } from "@/lib/types";
import { toSafeUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** POST /api/chat — context-aware conversational assistant. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { summary } = await loadSummary(user.id);
  const locale = parsed.data.locale ?? user.locale ?? "en";
  const response = await chatReply(parsed.data.messages, summary, toSafeUser(user), locale);
  return NextResponse.json(response);
}
