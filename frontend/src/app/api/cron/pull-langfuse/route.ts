import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Vercel Cron endpoint — pulls new Langfuse traces every 5 minutes.
 * Calls /api/langfuse/pull/all which covers:
 *   - Aethen's own Langfuse account (env vars)
 *   - All external agent sources registered via Settings → Integrations
 * Each source uses an independent watermark for incremental pull.
 */
export async function GET(request: Request) {
  // Verify the request comes from Vercel Cron (production guard)
  const authHeader = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/langfuse/pull/all?limit=50`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = body?.error ?? `Backend returned ${res.status}`;
      if (res.status === 503) {
        return NextResponse.json({ ok: true, skipped: true, reason: detail });
      }
      throw new Error(detail);
    }

    const data = await res.json();
    const total = data?.data?.total_sessions_ingested ?? 0;
    const sources = Object.keys(data?.data?.sources ?? {});

    return NextResponse.json({
      ok: true,
      total_sessions_ingested: total,
      sources_pulled: sources,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
