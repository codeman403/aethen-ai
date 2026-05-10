export async function register() {
  // Only initialise Sentry in the Node.js runtime (API routes, server components).
  // Deliberately excluded from the Edge Runtime (middleware) to avoid
  // MIDDLEWARE_INVOCATION_FAILED caused by node:async_hooks import.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      });
    }
  }
  // Edge Runtime (middleware) intentionally left un-instrumented.
}
