"use client";

import { useEffect, useState } from "react";
import { Mail, RefreshCw, Loader2, Plus, X, CheckCircle2 } from "lucide-react";
import { fetchDigestSettings, updateDigestSettings } from "@/lib/api";

export default function DigestRecipientsPage() {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchDigestSettings();
      setRecipients(data.recipients);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address"); return;
    }
    if (recipients.includes(email)) { setError("Already added"); return; }
    setRecipients(prev => [...prev, email]);
    setNewEmail(""); setError(null);
  };

  const removeEmail = (email: string) => setRecipients(prev => prev.filter(e => e !== email));

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateDigestSettings(recipients);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
              <Mail className="size-6" />
            </div>
            Digest Recipients
          </h2>
          <p className="text-muted-foreground text-base">
            Who receives the daily failure-intelligence email report. Sent every morning at 7am UTC.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 space-y-5 max-w-xl">
          {/* Recipient list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipients</p>
            {recipients.length === 0 && (
              <p className="text-sm text-muted-foreground">No recipients — add an email below.</p>
            )}
            <div className="space-y-2">
              {recipients.map(email => (
                <div key={email} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-muted/30 border border-border/50">
                  <span className="text-sm font-medium">{email}</span>
                  <button onClick={() => removeEmail(email)}
                    className="p-0.5 rounded hover:bg-rose-500/10 hover:text-rose-500 transition-colors text-muted-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add email */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add recipient</p>
            <div className="flex gap-2">
              <input
                type="email" value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addEmail()}
                placeholder="email@example.com"
                className="flex-1 px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={addEmail}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
                <Plus className="size-3.5" /> Add
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="size-3.5" /> Saved</span>}
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p>• Daily digest is sent every morning at <strong className="text-foreground">7:00 AM UTC</strong></p>
            <p>• Includes previous day's session count, failure breakdown, and high-severity alerts</p>
            <p>• Also delivered to your <a href="/settings/webhooks" className="text-primary hover:underline">registered Discord webhook</a> if subscribed to <code className="bg-muted px-1 rounded">daily.digest</code></p>
          </div>
        </div>
      )}
    </div>
  );
}
