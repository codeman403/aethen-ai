"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import {
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  BrainCircuit,
  ChevronDown,
} from "lucide-react";
import {
  fetchModelSettings,
  updateModelSetting,
  testModelConnectivity,
  type RoleConfig,
  type ModelOption,
  type TestModelResult,
} from "@/lib/api";

// ── Provider styles ───────────────────────────────────────────────────────

const PROVIDER_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  openai:    { label: "OpenAI",    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  anthropic: { label: "Anthropic", color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20" },
};

function ProviderBadge({ provider, small = false }: { provider: string; small?: boolean }) {
  const s = PROVIDER_STYLE[provider] ?? PROVIDER_STYLE.openai;
  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${s.bg} ${s.border} ${s.color} ${small ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"}`}>
      {s.label}
    </span>
  );
}

const ROLE_ICON: Record<string, React.ElementType> = {
  analysis:  Zap,
  synthesis: BrainCircuit,
};

// ── ModelCard — plain div (no SpotlightCard) to avoid overflow-hidden/transform stacking context
// ── Dropdown uses createPortal so it renders at document root, escaping all parent overflow/z-index constraints

function ModelCard({ cfg, onSaved }: { cfg: RoleConfig; onSaved: () => void }) {
  const Icon = ROLE_ICON[cfg.role] ?? Settings;
  const providerStyle = PROVIDER_STYLE[cfg.current_provider] ?? PROVIDER_STYLE.openai;

  const [selected, setSelected] = useState(cfg.current_model);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestModelResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDirty = selected !== cfg.current_model;
  const selectedOption = cfg.options.find((o: ModelOption) => o.id === selected);

  // Close dropdown only when clicking outside BOTH the trigger button AND the portal dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton = buttonRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideButton && !insideDropdown) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen((v) => !v);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateModelSetting(cfg.role, selected);
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testModelConnectivity(selected);
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, model_id: selected, provider: selectedOption?.provider ?? "", message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50 bg-muted/10 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-xl ${providerStyle.bg} border ${providerStyle.border}`}>
            <Icon className={`size-5 ${providerStyle.color}`} />
          </div>
          <div>
            <h3 className="font-semibold text-base tracking-tight">{cfg.role_label}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{cfg.role_subtitle}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Active</p>
          <div className="flex items-center gap-1.5 justify-end mt-0.5">
            <ProviderBadge provider={cfg.current_provider} small />
            <p className="text-sm font-mono font-medium">{cfg.current_model}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Model selector button */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Select Model
          </label>
          <button
            ref={buttonRef}
            onClick={handleToggle}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-background hover:bg-muted/40 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedOption && <ProviderBadge provider={selectedOption.provider} small />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedOption?.label ?? selected}</p>
                {selectedOption?.description && (
                  <p className="text-xs text-muted-foreground truncate">{selectedOption.description}</p>
                )}
              </div>
            </div>
            <ChevronDown className={`size-4 text-muted-foreground shrink-0 ml-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
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

        {saveError && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm">
            <XCircle className="size-4 shrink-0 mt-0.5" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            Test Connection
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving || testing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            {saving ? "Saving…" : "Apply"}
          </button>
          {isDirty && !saving && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unsaved change</p>
          )}
        </div>
      </div>

      {/* Portal dropdown — renders at document.body, no overflow or z-index constraints */}
      {open && dropdownPos && typeof window !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
          className="rounded-xl border bg-card shadow-2xl overflow-hidden"
        >
          {(["openai", "anthropic"] as const).map((prov) => {
            const provModels = cfg.options.filter((o: ModelOption) => o.provider === prov);
            if (!provModels.length) return null;
            const ps = PROVIDER_STYLE[prov];
            return (
              <div key={prov}>
                <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${ps.color} ${ps.bg} border-b ${ps.border}`}>
                  {ps.label}
                </div>
                {provModels.map((opt: ModelOption) => (
                  <button
                    key={opt.id}
                    onClick={() => { setSelected(opt.id); setOpen(false); setTestResult(null); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors border-b last:border-0 ${selected === opt.id ? "bg-primary/5" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{opt.label}</p>
                        {opt.id === cfg.current_model && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">active</span>
                        )}
                        {opt.id === selected && opt.id !== cfg.current_model && (
                          <span className="text-xs text-primary font-medium">selected</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    {selected === opt.id && <CheckCircle2 className="size-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function ModelSettingsPage() {
  const [settings, setSettings] = useState<RoleConfig[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchModelSettings();
      // Exclude the demo role — it's configured directly in the Demo Agent page
      setSettings(data.roles.filter((r) => r.role !== "demo"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
              <BrainCircuit className="size-6" />
            </div>
            LLM Configuration
          </h2>
          <p className="text-muted-foreground text-base">
            Select the models that power each stage of the analysis pipeline.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !settings && (
        <div className="flex items-center gap-2 text-base text-muted-foreground py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Loading model settings…
        </div>
      )}

      {settings && (
        <div className="grid gap-6 lg:grid-cols-2">
          {settings.map((cfg) => (
            <ModelCard key={cfg.role} cfg={cfg} onSaved={load} />
          ))}
        </div>
      )}

      {/* Info card — plain div, no animation */}
      {settings && (
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h4 className="font-semibold text-sm mb-3">How model selection works</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary font-bold shrink-0">→</span><span><strong className="text-foreground">Analysis & Routing</strong> — intent classification and all 4 analysis module nodes (Memory, Tool, Hallucination, Blind Spot).</span></li>
            <li className="flex gap-2"><span className="text-primary font-bold shrink-0">→</span><span><strong className="text-foreground">Synthesis & Chat</strong> — final synthesis report and freeform Chat Debug interface.</span></li>
            <li className="flex gap-2"><span className="text-primary font-bold shrink-0">→</span><span>Any role can use any model — OpenAI or Anthropic. Changes apply immediately with no restart.</span></li>
          </ul>
        </div>
      )}
    </div>
  );
}
