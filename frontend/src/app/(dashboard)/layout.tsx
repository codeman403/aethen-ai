import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { NeuralBackground } from "@/components/ui/neural-background";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { SessionTimeoutModal } from "@/components/SessionTimeoutModal";
import { TrialBanner } from "@/components/TrialBanner";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  orgName: string | null;
  role: string;
  isAdmin: boolean;
}

async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch org + role from profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, role, organizations(name)")
    .eq("id", user.id)
    .single();

  const orgName =
    (profile?.organizations as { name?: string } | null)?.name ?? null;

  // Admin detection — same logic as backend middleware (ADMIN_EMAILS env var).
  // Checked server-side only; no network call needed.
  const adminEmailSet = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  );
  const isAdmin = adminEmailSet.size > 0 && adminEmailSet.has((user.email ?? "").toLowerCase());

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
    orgName,
    role: profile?.role ?? "member",
    isAdmin,
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userProfile = await getUserProfile();

  if (!userProfile) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-transparent selection:bg-primary/10">
      <SessionTimeoutModal />
      <NeuralBackground />
      <Sidebar userProfile={userProfile} />
      <div className="flex flex-1 flex-col overflow-hidden relative">
        <Header userProfile={userProfile} />
        <TrialBanner />
        <ScrollToTop />
        <main id="main-scroll" className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1400px] w-full p-8 pb-16 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-in-out">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
