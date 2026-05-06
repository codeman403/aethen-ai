"use client";

import { useEffect, useState } from "react";
import {
  Plug, Plus, Trash2, Zap, CheckCircle2, XCircle, Loader2, RefreshCw,
  KeyRound, Copy, RotateCcw, ShieldAlert, Link2, Bot, Code2,
} from "lucide-react";
import {
  fetchSources, addSource, removeSource, testSource, fetchAgentProfiles,
  getApiKeyStatus, generateApiKey, revokeApiKey,
  getDemoSource, setDemoSource,
  type SourceConfig, type AddSourcePayload, type TestSourceResult, type AgentProfile,
  type ApiKeyStatus, type GeneratedKey, type DemoSourceConfig,
} from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Provider styles ────────────────────────────────────────────────────────────

const PROVIDER_STYLE = {
  langfuse:  { label: "Langfuse",  color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10",  border: "border-violet-500/20" },
  langsmith: { label: "LangSmith", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
} as const;

function ProviderBadge({ provider }: { provider: "langfuse" | "langsmith" }) {
  const s = PROVIDER_STYLE[provider] ?? PROVIDER_STYLE.langfuse;
  return (
    <span className={`inline-flex items-center text-xs font-medium rounded-full border px-2 py-0.5 ${s.bg} ${s.border} ${s.color}`}>
      {s.label}
    </span>
  );
}

// ── Add integration form ───────────────────────────────────────────────────────

function AddIntegrationCard({ onAdded }: { onAdded: () => void }) {
  const [provider, setProvider] = useState<"langfuse" | "langsmith">("langfuse");
  const [name, setName] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestSourceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canTest = name.trim() && secretKey.trim() && (provider === "langsmith" || publicKey.trim());
  const canSave = testResult?.ok && !saving;

  const handleTest = async () => {
    if (!canTest) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      // Save first, then test, then remove if failed
      await addSource({ name: name.trim(), provider, public_key: publicKey.trim(), secret_key: secretKey, base_url: baseUrl.trim() });
      const result = await testSource(name.trim());
      setTestResult(result);
      if (!result.ok) {
        await removeSource(name.trim()).catch(() => {});
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      onAdded();
      setName(""); setPublicKey(""); setSecretKey(""); setBaseUrl(""); setTestResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-5 border-b border-border/50 bg-muted/10 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <Plus className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-base tracking-tight">Add Integration</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Connect a Langfuse or LangSmith account for automatic trace pull</p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Provider */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</label>
          <div className="flex gap-2">
            {(["langfuse", "langsmith"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setProvider(p); setTestResult(null); }}
                className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${
                  provider === p ? "bg-primary/10 border-primary/30 text-primary" : "border-border/50 hover:bg-muted"
                }`}
              >
                {PROVIDER_STYLE[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
          <input
            type="text"
            placeholder="e.g. my-agent-prod"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9\-_]/g, ""))}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-muted-foreground">Lowercase letters, digits, hyphens, underscores only</p>
        </div>

        {/* Public key (langfuse only) */}
        {provider === "langfuse" && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Public Key</label>
            <input
              type="text"
              placeholder="pk-lf-..."
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        {/* Secret key */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {provider === "langsmith" ? "API Key" : "Secret Key"}
          </label>
          <input
            type="password"
            placeholder={provider === "langsmith" ? "ls__..." : "sk-lf-..."}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-muted-foreground">Encrypted before storage — never returned in API responses</p>
        </div>

        {/* Base URL (optional) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Base URL <span className="normal-case font-normal text-muted-foreground">(optional — for self-hosted)</span>
          </label>
          <input
            type="text"
            placeholder={provider === "langfuse" ? "https://langfuse.yourcompany.com" : ""}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
            testResult.ok
              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400"
          }`}>
            {testResult.ok ? <CheckCircle2 className="size-4 shrink-0 mt-0.5" /> : <XCircle className="size-4 shrink-0 mt-0.5" />}
            <span>{testResult.message}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm">
            <XCircle className="size-4 shrink-0" />{error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleTest}
            disabled={!canTest || testing || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            Test Connection
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Save Integration
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Registered sources list ────────────────────────────────────────────────────

function SourceRow({ source, onRemove }: {
  source: SourceConfig;
  onRemove: (name: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestSourceResult | null>(null);

  const handleRemoveConfirm = async () => {
    setRemoving(true);
    try { onRemove(source.name); } finally { setRemoving(false); setConfirming(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSource(source.name);
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="px-5 py-4 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{source.name}</span>
            <ProviderBadge provider={source.provider} />
          </div>
          {testResult && (
            <p className={`text-xs mt-1 ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {testResult.ok ? "✓" : "✗"} {testResult.message}
            </p>
          )}
        </div>

        {!confirming ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
              Test
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 text-xs font-medium text-rose-600 hover:bg-rose-500/5 transition-colors"
            >
              <Trash2 className="size-3" />
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">Remove <span className="font-medium text-foreground">{source.name}</span>?</span>
            <button
              onClick={handleRemoveConfirm}
              disabled={removing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              {removing ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              Yes, remove
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── API Key card ──────────────────────────────────────────────────────────────

function ApiKeyCard() {
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
    } catch { setStatus({ exists: false, key_prefix: null }); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadStatus(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setConfirmRevoke(false);
    try {
      const result = await generateApiKey();
      setGeneratedKey(result.key);
      setStatus({ exists: true, key_prefix: result.key_prefix });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate key");
    } finally { setGenerating(false); }
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
    } finally { setGenerating(false); }
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-5 border-b border-border/50 bg-muted/10 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <KeyRound className="size-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="font-semibold text-base tracking-tight">Aethen API Key</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Used by the SDK and MCP server to authenticate with Aethen
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}

        {/* Key revealed after generation — shown once */}
        {generatedKey && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
              <ShieldAlert className="size-4 shrink-0 mt-0.5" />
              <span>Copy this key now — it will not be shown again.</span>
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
          <p className="text-sm text-muted-foreground">No API key configured. Generate one to connect the SDK or MCP server.</p>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm">
            <XCircle className="size-4 shrink-0" />{error}
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
                  <Trash2 className="size-3.5" />
                  Revoke
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
                <button onClick={() => setConfirmRevoke(false)} className="inline-flex items-center px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [sources, setSources] = useState<SourceConfig[] | null>(null);
  const [agents, setAgents] = useState<AgentProfile[] | null>(null);
  const [demoSource, setDemoSourceState] = useState<string>("default");
  const [demoSourceSaving, setDemoSourceSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, a, ds] = await Promise.all([fetchSources(), fetchAgentProfiles(), getDemoSource()]);
      setSources(s);
      setAgents(a);
      setDemoSourceState(ds.source_name);
    } catch { setSources([]); setAgents([]); }
    finally { setLoading(false); }
  };

  const handleSetDemoSource = async (name: string) => {
    setDemoSourceSaving(true);
    try {
      await setDemoSource(name);
      setDemoSourceState(name);
    } catch { /* silent — source may not exist */ }
    finally { setDemoSourceSaving(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleRemove = async (name: string) => {
    await removeSource(name);
    void load();
  };

  const SUB_TABS = [
    { key: "sources",    label: "Sources",          icon: Link2    },
    { key: "apikey",     label: "API Key",           icon: KeyRound },
    { key: "agents",     label: "Connected Agents",  icon: Bot      },
    { key: "quickstart", label: "Quickstart",        icon: Code2    },
  ] as const;

  type SubTab = typeof SUB_TABS[number]["key"];
  const [activeTab, setActiveTab] = useState<SubTab>("sources");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
              <Plug className="size-6" />
            </div>
            Integrations
          </h2>
          <p className="text-muted-foreground text-base">
            Connect agent observability accounts, manage your API key, and get SDK quickstart code.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-xl border border-border/30 w-fit">
        {SUB_TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-background shadow-sm text-foreground border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "sources" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <AddIntegrationCard onAdded={load} />
            <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
              <div className="px-6 py-5 border-b border-border/50 bg-muted/10">
                <h3 className="font-semibold text-base tracking-tight">Registered Sources</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Secret keys are encrypted — they cannot be viewed after saving</p>
              </div>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
                  <Loader2 className="size-4 animate-spin" />Loading…
                </div>
              )}
              {!loading && (!sources || sources.length === 0) && (
                <div className="py-10 text-center text-sm text-muted-foreground">No sources configured yet</div>
              )}
              {!loading && sources && sources.length > 0 && (
                <div>
                  {sources.map((s) => (
                    <SourceRow key={s.name} source={s} onRemove={handleRemove} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Demo Agent analysis source selector */}
          <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="px-6 py-5 border-b border-border/50 bg-muted/10">
              <h3 className="font-semibold text-base tracking-tight">Aethen reads Demo traces from</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                After a demo run, Aethen fetches the trace from this source to run the analysis pipeline. Must match where the Demo Agent sends its traces.
              </p>
            </div>
            <div className="p-5 space-y-2">
              {/* Default option */}
              <label className="flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer hover:bg-muted/40 transition-colors">
                <input
                  type="radio"
                  name="demo-source"
                  value="default"
                  checked={demoSource === "default"}
                  onChange={() => handleSetDemoSource("default")}
                  disabled={demoSourceSaving}
                  className="accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Default</p>
                  <p className="text-xs text-muted-foreground">Use Langfuse env vars (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY)</p>
                </div>
              </label>
              {/* Registered sources */}
              {sources && sources.map((s) => (
                <label key={s.name} className="flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer hover:bg-muted/40 transition-colors">
                  <input
                    type="radio"
                    name="demo-source"
                    value={s.name}
                    checked={demoSource === s.name}
                    onChange={() => handleSetDemoSource(s.name)}
                    disabled={demoSourceSaving}
                    className="accent-primary"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <p className="text-sm font-medium">{s.name}</p>
                    <ProviderBadge provider={s.provider} />
                  </div>
                </label>
              ))}
              {(!sources || sources.length === 0) && !loading && (
                <p className="text-sm text-muted-foreground px-4">Register a source above to use it here.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "apikey" && <ApiKeyCard />}

      {activeTab === "agents" && (
        <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-5 border-b border-border/50 bg-muted/10">
            <h3 className="font-semibold text-base tracking-tight">Connected Agents</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Agents that have sent traces to Aethen</p>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
              <Loader2 className="size-4 animate-spin" />Loading…
            </div>
          )}
          {!loading && (!agents || agents.length === 0) && (
            <div className="py-10 text-center text-sm text-muted-foreground">No agents have connected yet</div>
          )}
          {!loading && agents && agents.length > 0 && (
            <div className="divide-y divide-border/30">
              {agents.slice(0, 10).map((agent) => (
                <div key={agent.agent_id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.agent_id}</p>
                    <p className="text-xs text-muted-foreground">{agent.total} sessions</p>
                  </div>
                  <div className="text-right shrink-0">
                    {(() => {
                      const total = agent.total ?? 0;
                      const failures = agent.total_failures ?? 0;
                      if (total === 0) return <p className="text-sm text-muted-foreground">No sessions</p>;
                      const pct = Math.round((failures / total) * 100);
                      return (
                        <p className={`text-sm font-semibold ${
                          pct > 40 ? "text-rose-600 dark:text-rose-400"
                          : pct > 20 ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {pct}% failure rate
                        </p>
                      );
                    })()}
                    {agent.last_seen && (
                      <p className="text-xs text-muted-foreground">Last seen {new Date(agent.last_seen).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "quickstart" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h4 className="font-semibold text-sm mb-1">Python SDK</h4>
            <p className="text-xs text-muted-foreground mb-4">Connect your agent in 3 lines. Credentials never stored by Aethen.</p>
            <pre className="text-xs bg-muted/50 rounded-xl p-4 overflow-x-auto border border-border/50 font-mono leading-relaxed">{`pip install aethen-sdk

from aethen_sdk import AethenClient
aethen = AethenClient(
  api_url="${BASE_URL}",
  api_key="your-aethen-api-key",
)

# Option A — stored source (configured under Sources tab)
report = await aethen.analyze_langfuse_trace(trace_id, source="my-agent")

# Option B — per-call credentials (never stored by Aethen)
report = await aethen.analyze_langfuse_trace_direct(
  trace_id,
  public_key=LANGFUSE_PUBLIC_KEY,
  secret_key=LANGFUSE_SECRET_KEY,
)
print(report["root_cause"])`}</pre>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
            <h4 className="font-semibold text-sm mb-1">MCP Server (Claude Desktop / Cursor)</h4>
            <p className="text-xs text-muted-foreground mb-4">Add to your Claude Desktop or Cursor MCP config. Tools and resources available immediately.</p>
            <pre className="text-xs bg-muted/50 rounded-xl p-4 overflow-x-auto border border-border/50 font-mono leading-relaxed">{`{
  "mcpServers": {
    "aethen": {
      "command": "poetry",
      "args": ["run", "python", "scripts/run_mcp.py"],
      "cwd": "/path/to/aethen-ai/backend",
      "env": {
        "AETHEN_API_URL": "${BASE_URL}",
        "AETHEN_API_KEY": "your-aethen-api-key"
      }
    }
  }
}`}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
