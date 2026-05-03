import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Vercel Cron endpoint — pulls new LangSmith traces every 5 minutes.
 * Requires LANGCHAIN_API_KEY to be set in the backend environment.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/langsmith/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50 }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = body?.error ?? `Backend returned ${res.status}`;
      // 503 = LangSmith not configured — not an error, just skip
      if (res.status === 503) {
        return NextResponse.json({ ok: true, skipped: true, reason: detail });
      }
      throw new Error(detail);
    }

    const data = await res.json();
    const ingested = data?.data?.sessions_ingested ?? 0;

    return NextResponse.json({
      ok: true,
      sessions_ingested: ingested,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
