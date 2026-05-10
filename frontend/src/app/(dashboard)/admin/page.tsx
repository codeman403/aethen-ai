"use client";

import { useEffect, useState } from "react";
import {
  ShieldAlert, RefreshCw, Loader2, Building2, Users, Database,
  BarChart3, ChevronRight, X, Check, Pencil, Trash2,
  Calendar, Hash,
} from "lucide-react";
import {
  fetchAdminOrgs, fetchPlatformStats, fetchAdminOrg,
  updateAdminQuota, removeOrgMember, updateOrgName,
  fetchGlobalLimits, updateGlobalLimits, fetchAuthStatus,
  type AdminOrgSummary, type AdminOrgDetail, type PlatformStats,
} from "@/lib/api";

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
          <Icon className="size-4" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="text-3xl font-extrabold tracking-tight tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Usage mini-bar ────────────────────────────────────────────────────────

function MiniBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct >= 90 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{used}/{limit}</span>
    </div>
  );
}

// ── Quota editor ──────────────────────────────────────────────────────────

function QuotaEditor({
  orgId, current, onSaved, onCancel,
}: {
  orgId: string;
  current: { sessions_per_month: number; analysis_runs_per_month: number };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [sessions, setSessions] = useState(String(current.sessions_per_month));
  const [analysis, setAnalysis] = useState(String(current.analysis_runs_per_month));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await updateAdminQuota(orgId, Number(sessions), Number(analysis));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sessions / month</label>
          <input type="number" min={0} value={sessions} onChange={e => setSessions(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Analysis runs / month</label>
          <input type="number" min={0} value={analysis} onChange={e => setAnalysis(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Save
        </button>
        <button onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium hover:bg-muted">
          <X className="size-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

// ── Org detail drawer ─────────────────────────────────────────────────────

function OrgDrawer({ orgId, orgSummary, onClose, onRefresh }: {
  orgId: string;
  orgSummary: AdminOrgSummary;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<AdminOrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingQuota, setEditingQuota] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetchAdminOrg(orgId);
      setDetail(d);
      setNewName(d.org_name);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [orgId]);

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from the org?")) return;
    await removeOrgMember(orgId, userId);
    void load(); onRefresh();
  };

  const handleSaveName = async () => {
    if (!detail || !newName.trim()) return;
    setSaving(true);
    try {
      await updateOrgName(orgId, newName.trim());
      setEditingName(false);
      void load(); onRefresh();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-background border-l border-border/50 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="min-w-0">
            <h2 className="font-semibold text-lg truncate">{detail?.org_name ?? orgSummary.org_name}</h2>
            <p className="text-xs text-muted-foreground font-mono">{orgId.slice(0, 8)}…</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0 ml-3">
            <X className="size-4" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {detail && !loading && (
          <div className="flex-1 overflow-auto p-6 space-y-6">

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-center">
                <p className="text-xs text-muted-foreground">Members</p>
                <p className="text-xl font-bold tabular-nums">{orgSummary.member_count}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-center">
                <p className="text-xs text-muted-foreground">Total Sessions</p>
                <p className="text-xl font-bold tabular-nums">{orgSummary.session_count.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-center">
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-xl font-bold tabular-nums">{orgSummary.sessions_this_month}</p>
              </div>
            </div>

            {/* Meta info */}
            <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/50">
              <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Hash className="size-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Org ID</span>
                <span className="ml-auto font-mono text-xs truncate max-w-[200px]">{orgId}</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Hash className="size-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Slug</span>
                <span className="ml-auto font-mono text-xs">{detail.org_slug}</span>
              </div>
              {detail.created_at && (
                <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Created</span>
                  <span className="ml-auto text-xs">{new Date(detail.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
              )}
            </div>

            {/* Org name */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organisation Name</p>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={handleSaveName} disabled={saving}
                    className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50">
                    {saving ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                  </button>
                  <button onClick={() => { setEditingName(false); setNewName(detail.org_name); }}
                    className="px-3 py-2 rounded-xl border text-sm hover:bg-muted">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{detail.org_name}</p>
                  <button onClick={() => setEditingName(true)} className="p-1 rounded hover:bg-muted transition-colors">
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            {/* Quota */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monthly Quota</p>
                {!editingQuota && (
                  <button onClick={() => setEditingQuota(true)}
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Pencil className="size-3" /> Edit
                  </button>
                )}
              </div>
              {editingQuota ? (
                <QuotaEditor orgId={orgId} current={detail.quota}
                  onSaved={() => { setEditingQuota(false); void load(); onRefresh(); }}
                  onCancel={() => setEditingQuota(false)} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Sessions / month</p>
                    <p className="text-xl font-bold tabular-nums">
                      {detail.quota.sessions_per_month === 0 ? "∞" : detail.quota.sessions_per_month.toLocaleString()}
                    </p>
                    {detail.quota.sessions_per_month === 0 && (
                      <p className="text-xs text-primary mt-0.5">Unlimited</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Analysis runs / month</p>
                    <p className="text-xl font-bold tabular-nums">
                      {detail.quota.analysis_runs_per_month === 0 ? "∞" : detail.quota.analysis_runs_per_month.toLocaleString()}
                    </p>
                    {detail.quota.analysis_runs_per_month === 0 && (
                      <p className="text-xs text-primary mt-0.5">Unlimited</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Usage history */}
            {detail.usage_history.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usage History</p>
                <div className="rounded-xl border border-border/50 divide-y divide-border/50">
                  {detail.usage_history.map(u => (
                    <div key={u.period} className="px-4 py-3 grid grid-cols-3 text-sm">
                      <span className="font-medium">{u.period}</span>
                      <span className="text-muted-foreground tabular-nums">{u.sessions_ingested.toLocaleString()} sessions</span>
                      <span className="text-muted-foreground tabular-nums">{u.analysis_runs.toLocaleString()} analyses</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Members ({detail.members.length})
              </p>
              <div className="rounded-xl border border-border/50 divide-y divide-border/50">
                {detail.members.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No members found.</p>
                )}
                {detail.members.map(m => (
                  <div key={m.user_id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      {m.signed_up_at && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          Joined {new Date(m.signed_up_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">
                        {m.role}
                      </span>
                      {m.role !== "owner" && (
                        <button onClick={() => handleRemoveMember(m.user_id)}
                          className="p-1 rounded hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                          title="Remove member">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [orgs, setOrgs] = useState<AdminOrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<AdminOrgSummary | null>(null);
  const [search, setSearch] = useState("");
  const [backendAdminStatus, setBackendAdminStatus] = useState<{ is_admin: boolean; checked: boolean; email?: string }>({ is_admin: false, checked: false });

  // Global limits
  const [maxBatch, setMaxBatch] = useState(10);
  const [maxDaily, setMaxDaily] = useState(20);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [limitsSaved, setLimitsSaved] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [s, o] = await Promise.all([fetchPlatformStats(), fetchAdminOrgs()]);
      setStats(s); setOrgs(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally { setLoading(false); }
  };

  const loadLimits = async () => {
    setLimitsLoading(true);
    try {
      const l = await fetchGlobalLimits();
      setMaxBatch(l.max_batch_analysis);
      setMaxDaily(l.max_daily_auto_analysis);
    } catch { /* non-fatal */ } finally { setLimitsLoading(false); }
  };

  const saveLimits = async () => {
    setLimitsSaving(true); setLimitsSaved(false);
    try {
      await updateGlobalLimits(maxBatch, maxDaily);
      setLimitsSaved(true); setTimeout(() => setLimitsSaved(false), 3000);
    } catch { /* show nothing */ } finally { setLimitsSaving(false); }
  };

  useEffect(() => {
    void load();
    void loadLimits();
    fetchAuthStatus().then(s => setBackendAdminStatus({ is_admin: s.is_admin, checked: true, email: (s as any).email_seen_by_backend })).catch(() => {});
  }, []);

  const filtered = orgs.filter(o =>
    o.org_name.toLowerCase().includes(search.toLowerCase()) ||
    o.org_slug.toLowerCase().includes(search.toLowerCase()) ||
    o.org_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20">
              <ShieldAlert className="size-6" />
            </div>
            Admin Panel
          </h2>
          <p className="text-muted-foreground text-base">
            Platform-wide overview, org management, and quota controls.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Backend admin status diagnostic */}
      {backendAdminStatus.checked && !backendAdminStatus.is_admin && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 space-y-1">
          <p className="font-semibold">Backend does not recognize you as admin</p>
          <p className="text-amber-600/80 dark:text-amber-500/80 text-xs leading-relaxed">
            Backend sees your email as: <code className="font-mono bg-amber-500/10 px-1 rounded">{backendAdminStatus.email || "unknown"}</code>.
            Make sure <code className="font-mono bg-amber-500/10 px-1 rounded">ADMIN_EMAILS</code> on Render matches exactly.
          </p>
          <ol className="text-xs text-amber-600/80 dark:text-amber-500/80 list-decimal list-inside space-y-0.5 pl-1">
            <li>Go to <strong>Render → your backend service → Environment</strong></li>
            <li>Confirm <code className="font-mono bg-amber-500/10 px-1 rounded">ADMIN_EMAILS</code> is set to your exact login email</li>
            <li>Click <strong>Save Changes</strong> → then <strong>Manual Deploy → Deploy latest commit</strong></li>
            <li>Wait ~2 min for the service to restart, then refresh this page</li>
          </ol>
        </div>
      )}
      {backendAdminStatus.checked && backendAdminStatus.is_admin && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <Check className="size-3.5 shrink-0" />
          Backend recognizes you as admin — all organisation data is visible.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !stats && (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}

      {stats && (
        <>
          {/* Platform stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Building2} label="Total Orgs"     value={stats.total_orgs} />
            <StatCard icon={Users}     label="Total Users"    value={stats.total_users} />
            <StatCard icon={Database}  label="Total Sessions" value={stats.total_sessions}
              sub={stats.unassigned_sessions > 0 ? `${stats.unassigned_sessions.toLocaleString()} unassigned (admin-ingested)` : undefined} />
            <StatCard icon={BarChart3} label="This Month"
              value={stats.sessions_this_month}
              sub={`${stats.analysis_this_month.toLocaleString()} analysis runs`} />
          </div>

          {/* Org table */}
          <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
              <h3 className="font-semibold text-base flex-1">
                Organisations ({orgs.length})
              </h3>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, slug, or ID…"
                className="px-3 py-1.5 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary w-56"
              />
            </div>
            <div className="divide-y divide-border/50">
              {filtered.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No organisations found.
                </p>
              )}
              {filtered.map(org => (
                <button
                  key={org.org_id}
                  onClick={() => setSelectedOrg(org)}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{org.org_name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {org.org_slug} · {org.org_id.slice(0, 8)}…
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Members</p>
                      <p className="text-sm font-semibold">{org.member_count}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Sessions</p>
                      <MiniBar used={org.sessions_this_month} limit={org.sessions_limit} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Analysis</p>
                      <MiniBar used={org.analysis_this_month} limit={org.analysis_limit} />
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Global analysis limits */}
      {stats && (
        <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-base">Global Analysis Limits</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Applied to all organisations. Admin users are exempt from batch limits but share the daily auto-analysis cap.
            </p>
          </div>
          {limitsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Max Batch Analysis per User
                </label>
                <input type="number" min={1} max={100} value={maxBatch}
                  onChange={e => setMaxBatch(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                <p className="text-[10px] text-muted-foreground">Max sessions a user can batch-analyze at once. Admin = unlimited.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Daily Auto-Analysis Cap (all orgs)
                </label>
                <input type="number" min={1} max={500} value={maxDaily}
                  onChange={e => setMaxDaily(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                <p className="text-[10px] text-muted-foreground">Max failure sessions analyzed per org by the daily cron job.</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={saveLimits} disabled={limitsSaving || limitsLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {limitsSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {limitsSaving ? "Saving…" : "Save Limits"}
            </button>
            {limitsSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Saved</span>}
          </div>
        </div>
      )}

      {selectedOrg && (
        <OrgDrawer
          orgId={selectedOrg.org_id}
          orgSummary={selectedOrg}
          onClose={() => setSelectedOrg(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
