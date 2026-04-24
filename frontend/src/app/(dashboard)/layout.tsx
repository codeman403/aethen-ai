import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-muted/10 selection:bg-primary/10">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1400px] w-full p-8 pb-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
