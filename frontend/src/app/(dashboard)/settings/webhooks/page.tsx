"use client";

import { useEffect, useState } from "react";
import {
  Webhook, RefreshCw, Loader2, Plus, Trash2, Zap,
  CheckCircle2, XCircle, Copy, Check, Pencil,
} from "lucide-react";
import {
  fetchWebhooks, createWebhook, deleteWebhook, testWebhook, updateWebhook,
  WEBHOOK_EVENTS, type WebhookConfig,
} from "@/lib/api";

// ── Copy button ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}

// ── Webhook row ───────────────────────────────────────────────────────────

function WebhookRow({ webhook, onDeleted, onRefresh }: {
  webhook: WebhookConfig;
  onDeleted: () => void;
  onRefresh: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status_code?: number; error?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(webhook.url);
  const [editEvents, setEditEvents] = useState<string[]>(webhook.events ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const domain = (() => { try { return new URL(webhook.url).hostname.replace("www.", ""); } catch { return "Webhook"; } })();

  const openEdit = () => {
    setEditUrl(webhook.url);
    setEditEvents(webhook.events ?? []);
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try {
      await updateWebhook(webhook.id, editUrl, editEvents);
      onRefresh();
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      setTestResult(await testWebhook(webhook.id));
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : "Failed" });
    } finally { setTesting(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove this webhook?`)) return;
    setDeleting(true);
    try { await deleteWebhook(webhook.id); onDeleted(); }
    finally { setDeleting(false); }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      {/* Compact row */}
      <div className="px-5 py-3.5 flex items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <p className="text-sm font-medium">{domain}</p>
          <CopyButton text={webhook.url} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleTest} disabled={testing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50">
            {testing ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
            Test
          </button>
          {testResult && (
            <span className={`flex items-center gap-1 text-xs font-medium ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {testResult.ok
                ? <><CheckCircle2 className="size-3.5" /> Delivered</>
                : <><XCircle className="size-3.5" /> {testResult.error ?? `HTTP ${testResult.status_code}`}</>
              }
            </span>
          )}
          <button onClick={openEdit}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <Pencil className="size-3.5" />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 transition-colors text-muted-foreground disabled:opacity-50">
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded edit section */}
      {editing && (
        <div className="border-t border-border/50 px-5 py-4 space-y-4 bg-muted/20">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endpoint URL</label>
            <input
              type="url"
              value={editUrl}
              onChange={e => setEditUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subscribed Events</label>
            <div className="space-y-2">
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.id} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editEvents.includes(ev.id)}
                    onChange={e => setEditEvents(prev =>
                      e.target.checked ? [...prev, ev.id] : prev.filter(x => x !== ev.id)
                    )}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <p className="text-xs font-medium">{ev.label}</p>
                    <p className="text-[10px] text-muted-foreground">{ev.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Added {new Date(webhook.created_at).toLocaleDateString()}
          </p>

          {saveError && <p className="text-xs text-destructive">{saveError}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !editUrl.trim() || editEvents.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-xl border text-xs font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────

function AddWebhookForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(WEBHOOK_EVENTS.map(e => e.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (id: string) => {
    setSelectedEvents(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!url.trim()) { setError("URL is required"); return; }
    if (selectedEvents.length === 0) { setError("Select at least one event"); return; }
    setSaving(true);
    setError(null);
    try {
      await createWebhook(url.trim(), selectedEvents);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create webhook");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
      <h3 className="font-semibold text-sm">Add Webhook Endpoint</h3>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endpoint URL</label>
        <input
          type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://your-app.com/webhooks/aethen"
          className="w-full px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Events to subscribe</label>
        <div className="space-y-2">
          {WEBHOOK_EVENTS.map(ev => (
            <label key={ev.id} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedEvents.includes(ev.id)}
                onChange={() => toggleEvent(ev.id)}
                className="mt-0.5 rounded"
              />
              <div>
                <p className="text-sm font-medium">{ev.label}</p>
                <p className="text-xs text-muted-foreground">{ev.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {saving ? "Saving…" : "Add Webhook"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setWebhooks(await fetchWebhooks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
              <Webhook className="size-6" />
            </div>
            Webhooks
          </h2>
          <p className="text-muted-foreground text-base">
            Receive real-time events from Aethen in your own systems.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {!adding && (
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="size-4" /> Add Webhook
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {adding && (
        <AddWebhookForm
          onAdded={() => { setAdding(false); void load(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading && webhooks.length === 0 && (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && webhooks.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
          <Webhook className="size-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-muted-foreground">No webhooks configured</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Add an endpoint to receive analysis events.</p>
        </div>
      )}

      <div className="space-y-3">
        {webhooks.map(w => (
          <WebhookRow key={w.id} webhook={w} onDeleted={load} onRefresh={load} />
        ))}
      </div>

      {/* Docs */}
      {webhooks.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h4 className="font-semibold text-sm mb-3">Verifying webhook signatures</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Each request includes an <code className="text-xs bg-muted px-1.5 py-0.5 rounded">X-Aethen-Signature</code> header with the HMAC-SHA256 of the raw body, prefixed with <code className="text-xs bg-muted px-1.5 py-0.5 rounded">sha256=</code>.
          </p>
          <pre className="text-xs bg-muted rounded-xl p-4 overflow-auto">{`import hmac, hashlib

def verify(secret: str, body: bytes, signature: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)`}</pre>
        </div>
      )}
    </div>
  );
}
