"use client";

import { useEffect, useState } from "react";
import {
  KeyRound, CheckCircle2, XCircle, Loader2, Copy, RotateCcw, Trash2, ShieldAlert,
} from "lucide-react";
import {
  getApiKeyStatus, generateApiKey, revokeApiKey,
  type ApiKeyStatus, type GeneratedKey,
} from "@/lib/api";
import { SpotlightCard } from "@/components/ui/spotlight-card";

export default function ApiKeyPage() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const s = await getApiKeyStatus();
      setStatus(s);
    } catch {
      setStatus({ exists: false, key_prefix: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setConfirmRevoke(false);
    try {
      const result: GeneratedKey = await generateApiKey();
      setGeneratedKey(result.key);
      setStatus({ exists: true, key_prefix: result.key_prefix });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate key");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async () => {
    setGenerating(true);
    try {
      await revokeApiKey();
      setStatus({ exists: false, key_prefix: null });
      setGeneratedKey(null);
      setConfirmRevoke(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20">
            <KeyRound className="size-6" />
          </div>
          Aethen API Key
        </h2>
        <p className="text-muted-foreground text-base mt-1">
          Used by the SDK and MCP server to authenticate with Aethen. Generate one key per environment.
        </p>
      </div>

      <SpotlightCard className="p-0 overflow-hidden max-w-2xl">
        <div className="px-6 py-5 border-b border-border/50 bg-muted/10 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <KeyRound className="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base tracking-tight">API Key</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Scoped to your organization — never shared with other users
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          )}

          {/* Key revealed after generation */}
          {generatedKey && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 px-4 py-3 rounded-xl border bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                <span>Copy this key now — it will <strong>not</strong> be shown again.</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-2.5 rounded-xl border bg-muted/50 text-sm font-mono truncate">
                  {generatedKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors shrink-0"
                >
                  {copied ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Status when key exists but not just generated */}
          {!loading && status?.exists && !generatedKey && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-muted/30">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">API key configured</p>
                <p className="text-xs text-muted-foreground font-mono">{status.key_prefix}••••••••</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !status?.exists && !generatedKey && (
            <p className="text-sm text-muted-foreground">
              No API key configured. Generate one to connect the SDK or MCP server.
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm">
              <XCircle className="size-4 shrink-0" /> {error}
            </div>
          )}

          {/* Actions */}
          {!loading && (
            <div className="flex items-center gap-3 pt-1">
              {!status?.exists ? (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {generating ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                  Generate API Key
                </button>
              ) : !confirmRevoke ? (
                <>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    Regenerate
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-500/30 text-sm font-medium text-rose-600 hover:bg-rose-500/5 transition-colors"
                  >
                    <Trash2 className="size-3.5" /> Revoke
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">Revoke key? All agents using it will lose access.</span>
                  <button
                    onClick={handleRevoke}
                    disabled={generating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    Yes, revoke
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(false)}
                    className="inline-flex items-center px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </SpotlightCard>
    </div>
  );
}
