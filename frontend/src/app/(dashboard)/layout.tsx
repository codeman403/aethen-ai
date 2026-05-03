import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { NeuralBackground } from "@/components/ui/neural-background";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-transparent selection:bg-primary/10">
      <NeuralBackground />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1400px] w-full p-8 pb-16 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-in-out">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
