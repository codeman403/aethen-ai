"use client";

import { useEffect, useState } from "react";
import { User, Building2, Shield, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import { SpotlightCard } from "@/components/ui/spotlight-card";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  role: string;
  org_id: string;
  org_name: string;
}

// ── Reusable field ─────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, readOnly = false, type = "text",
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          readOnly
            ? "bg-muted/40 border-border/40 text-muted-foreground cursor-not-allowed"
            : "bg-card border-border focus:border-primary/40"
        }`}
      />
    </div>
  );
}

function SaveButton({ saving, saved, onClick, disabled }: {
  saving: boolean; saved: boolean; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {saving ? (
        <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
      ) : saved ? (
        <><CheckCircle2 className="size-3.5" /> Saved</>
      ) : (
        "Save changes"
      )}
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Personal form state
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Org form state
  const [orgName, setOrgName] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [savedOrg, setSavedOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !user) throw new Error("Not authenticated");

        // Use the backend profile endpoint — creates profile+org if missing
        // (handles users who signed up before the DB trigger was added)
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";

        const res = await fetch(`${BASE_URL}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok || body.error) throw new Error(body.error ?? "Failed to load profile");

        const prof = body.data;
        const data: ProfileData = {
          id: user.id,
          email: user.email ?? "",
          full_name: prof.full_name ?? "",
          avatar_url: prof.avatar_url ?? "",
          role: prof.role ?? "member",
          org_id: prof.org_id ?? "",
          org_name: prof.org_name ?? "",
        };

        setProfile(data);
        setFullName(data.full_name);
        setOrgName(data.org_name);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    setSavedProfile(false);
    setProfileError(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("id", profile.id);
      if (error) throw error;
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2500);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveOrg = async () => {
    if (!profile?.org_id) return;
    setSavingOrg(true);
    setSavedOrg(false);
    setOrgError(null);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: orgName.trim() })
        .eq("id", profile.org_id);
      if (error) throw error;
      setSavedOrg(true);
      setTimeout(() => setSavedOrg(false), 2500);
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingOrg(false);
    }
  };

  const ROLE_STYLE: Record<string, string> = {
    owner:  "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20",
    admin:  "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    member: "text-muted-foreground bg-muted border-border/50",
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
            <User className="size-6" />
          </div>
          Profile & Organization
        </h2>
        <p className="text-muted-foreground text-base mt-1">
          Manage your personal details and organization settings.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Loading profile…
        </div>
      ) : profile && (
        <div className="grid gap-6 lg:grid-cols-2">

          {/* ── Personal Info ─────────────────────────────────────────── */}
          <SpotlightCard className="p-6 space-y-5">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <User className="size-4" />
              </div>
              <h3 className="font-semibold tracking-tight">Personal Info</h3>
            </div>

            {/* Avatar preview */}
            <div className="flex items-center gap-3">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="size-12 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="size-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                  {(fullName || profile.email)[0]?.toUpperCase() ?? "U"}
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{fullName || profile.email.split("@")[0]}</p>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${ROLE_STYLE[profile.role] ?? ROLE_STYLE.member}`}>
                  {profile.role}
                </span>
              </div>
            </div>

            <Field
              label="Full Name"
              value={fullName}
              onChange={setFullName}
              placeholder="Jane Smith"
            />
            <Field
              label="Email"
              value={profile.email}
              readOnly
              type="email"
            />

            {profileError && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="size-3.5" />{profileError}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Email is managed by your auth provider.
              </p>
              <SaveButton
                saving={savingProfile}
                saved={savedProfile}
                onClick={handleSaveProfile}
                disabled={fullName.trim() === profile.full_name}
              />
            </div>
          </SpotlightCard>

          {/* ── Organization ──────────────────────────────────────────── */}
          <SpotlightCard className="p-6 space-y-5">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <Building2 className="size-4" />
              </div>
              <h3 className="font-semibold tracking-tight">Organization</h3>
            </div>

            <Field
              label="Organization Name"
              value={orgName}
              onChange={profile.role === "owner" ? setOrgName : undefined}
              readOnly={profile.role !== "owner"}
              placeholder="Acme Corp"
            />

            {profile.role !== "owner" && (
              <div className="flex items-start gap-2 rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5">
                <Shield className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Only the organization owner can change the name.
                </p>
              </div>
            )}

            {orgError && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="size-3.5" />{orgError}
              </p>
            )}

            {profile.role === "owner" && (
              <div className="flex justify-end pt-1">
                <SaveButton
                  saving={savingOrg}
                  saved={savedOrg}
                  onClick={handleSaveOrg}
                  disabled={orgName.trim() === profile.org_name}
                />
              </div>
            )}
          </SpotlightCard>

        </div>
      )}
    </div>
  );
}
