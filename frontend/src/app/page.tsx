"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import Link from "next/link";
import { 
  ArrowRight, 
  BrainCircuit, 
  ScanSearch, 
  ShieldCheck, 
  Database, 
  LayoutDashboard, 
  Zap,
  Code,
  Terminal,
  Activity,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  BarChart3,
  Globe,
  Clock
} from "lucide-react";

// --- Scroll Animation Wrapper ---
function ScrollReveal({ children, delay = 0, className = "" }: { children: ReactNode, delay?: number, className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary/20 selection:text-primary scroll-smooth">
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 z-[-1] bg-background bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]">
        <div className="absolute left-1/2 top-0 -z-10 -translate-x-1/2 h-[800px] w-[800px] rounded-full bg-primary/20 opacity-30 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute left-1/4 bottom-0 -z-10 h-[600px] w-[600px] rounded-full bg-blue-500/10 opacity-30 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute right-1/4 top-1/4 -z-10 h-[500px] w-[500px] rounded-full bg-purple-500/10 opacity-30 blur-[100px] mix-blend-screen animate-pulse" style={{ animationDuration: '12s' }} />
      </div>

      {/* Navigation */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? 'border-b border-white/10 bg-background/80 backdrop-blur-md py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center font-bold text-white shadow-lg shadow-primary/20">
              Ae
            </div>
            <span className="font-bold tracking-tight text-xl">Aethen-AI</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#architecture" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Architecture</a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
              <Code className="size-4" /> Source Code
            </a>
            <div className="w-px h-4 bg-border" />
            <Link
              href="/overview"
              className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-2"
            >
              Sign In <ArrowRight className="size-4" />
            </Link>
          </nav>

          {/* Mobile Menu Toggle */}
          <button className="md:hidden p-2 text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-background border-b border-border p-4 flex flex-col gap-4 shadow-xl">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium p-2">Features</a>
            <a href="#architecture" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium p-2">Architecture</a>
            <Link href="/overview" className="text-sm font-bold text-primary p-2 flex items-center gap-2">
              Sign In <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
      </header>

      <main className="pt-24 pb-16 px-6">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto text-center mt-8 mb-24">
          <ScrollReveal delay={0}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-sm font-medium mb-8 text-primary shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <Zap className="size-4" />
              <span>Agent Reliability Studio v1.0</span>
            </div>
          </ScrollReveal>
          
          <ScrollReveal delay={100}>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]">
              Diagnose why your <br className="hidden md:block" />
              <span className="bg-gradient-to-br from-primary via-primary/80 to-purple-600 bg-clip-text text-transparent">
                AI agents fail.
              </span>
            </h1>
          </ScrollReveal>
          
          <ScrollReveal delay={200}>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
              The failure intelligence platform for LLM applications. Automatically classify, diagnose, and resolve hallucinations, memory faults, and tool misfires in production.
            </p>
          </ScrollReveal>
          
          <ScrollReveal delay={300}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/overview"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 hover:scale-105 transition-all duration-300 shadow-lg shadow-primary/25 w-full sm:w-auto"
              >
                Launch Studio
                <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-border/50 bg-card hover:border-primary/20 transition-all duration-300/50 backdrop-blur-sm font-semibold text-lg hover:bg-muted transition-all duration-300 w-full sm:w-auto"
              >
                Explore Features
              </a>
            </div>
          </ScrollReveal>
        </section>

        {/* Failure Types Section */}
        <section id="features" className="max-w-7xl mx-auto mb-24 p-8 md:p-12 rounded-[2.5rem] border bg-gradient-to-br from-card/80 to-muted/20 backdrop-blur-xl relative shadow-2xl">
          <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none rounded-r-[2.5rem]" />
          
          <div className="grid lg:grid-cols-2 gap-16 items-center relative z-10">
            <div>
              <ScrollReveal delay={0}>
                <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">Master every failure mode.</h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  Aethen categorizes agent failures into distinct actionable buckets, allowing your team to deploy targeted fixes faster instead of manually reading through thousands of traces.
                </p>
                
                <ul className="space-y-5">
                  {[
                    { title: "Hallucinations & Grounding Errors", desc: "Detect when the LLM invents facts not present in the retrieved context." },
                    { title: "Tool Misfires & API Cascades", desc: "Identify infinite loops and bad parameter formatting." },
                    { title: "Memory & Context Loss", desc: "Spot when the agent forgets instructions from earlier in the session." },
                    { title: "Knowledge Blind Spots", desc: "Find topics where your vector database lacks sufficient information." }
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-muted/50 transition-colors">
                      <div className="p-2 bg-primary/10 rounded-xl shrink-0 mt-0.5">
                        <ShieldCheck className="size-5 text-primary" />
                      </div>
                      <div>
                        <span className="font-semibold block text-foreground">{item.title}</span>
                        <span className="text-sm text-muted-foreground">{item.desc}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollReveal>
            </div>
            
            <ScrollReveal delay={200} className="relative h-full w-full flex items-center justify-center">
              <div className="w-full h-full min-h-[450px] rounded-2xl border border-border/50 bg-[#1E1E1E] shadow-2xl overflow-hidden relative group flex flex-col font-mono text-sm">
                {/* macOS style title bar */}
                <div className="w-full h-10 bg-[#2D2D2D] flex items-center px-4 shrink-0">
                  <div className="flex gap-2">
                    <div className="size-3 rounded-full bg-[#FF5F56]" />
                    <div className="size-3 rounded-full bg-[#FFBD2E]" />
                    <div className="size-3 rounded-full bg-[#27C93F]" />
                  </div>
                  <div className="flex-1 text-center text-[#858585] text-xs">aethen-trace-viewer.ts</div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-hidden flex">
                  {/* Line numbers */}
                  <div className="w-12 bg-[#1E1E1E] border-r border-white/5 py-4 flex flex-col items-end pr-3 text-[#5A5A5A] text-xs shrink-0 select-none">
                    {[...Array(14)].map((_, i) => (
                      <span key={i} className="leading-6">{i + 1}</span>
                    ))}
                  </div>
                  
                  {/* Code/Log content */}
                  <div className="flex-1 p-4 overflow-hidden bg-[#1E1E1E] text-[#D4D4D4] text-xs leading-6">
                    <div className="text-[#569CD6]">import <span className="text-[#9CDCFE]">{'{'}</span> analyzeTrace <span className="text-[#9CDCFE]">{'}'}</span> from <span className="text-[#CE9178]">'@aethen/core'</span>;</div>
                    <br/>
                    <div><span className="text-[#569CD6]">const</span> trace = <span className="text-[#4EC9B0]">await</span> getLangfuseTrace(<span className="text-[#CE9178]">'session_a8f92b41'</span>);</div>
                    <div><span className="text-[#569CD6]">const</span> report = <span className="text-[#4EC9B0]">await</span> analyzeTrace(trace);</div>
                    <br/>
                    <div className="text-[#6A9955]">// Execute diagnosis pipeline...</div>
                    <div className="flex items-center gap-2 text-[#4EC9B0]">
                      <span className="animate-pulse">❯</span> Running heuristic checks... <span className="text-[#CE9178]">DONE</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#4EC9B0]">
                      <span className="animate-pulse">❯</span> Evaluating retrieval context... <span className="text-[#CE9178]">DONE</span>
                    </div>
                    <br/>
                    <div className="text-[#C586C0]">if <span className="text-[#D4D4D4]">(report.hasFailure) {'{'}</span></div>
                    <div className="pl-4 text-[#9CDCFE]">console<span className="text-[#D4D4D4]">.</span><span className="text-[#DCDCAA]">error</span><span className="text-[#D4D4D4]">(report.findings);</span></div>
                    <div className="pl-4 mt-2 p-2 bg-[#F14C4C]/10 border border-[#F14C4C]/20 rounded text-[#F14C4C]">
                      [Hallucination Detected]<br/>
                      Agent hallucinated entity "Project Olympus" not found in RAG docs.
                    </div>
                    <div className="text-[#D4D4D4]">{'}'}</div>
                  </div>
                </div>

                {/* Floating element - Moved inside container bounds to prevent hanging */}
                <div className="absolute right-4 bottom-4 p-3 rounded-xl border border-emerald-500/30 bg-[#2D2D2D]/95 backdrop-blur-md shadow-xl flex items-center gap-3 transition-transform hover:-translate-y-1 duration-300 z-20">
                  <div className="size-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck className="size-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Diagnosis Complete</p>
                    <p className="text-[10px] text-emerald-400 font-medium">Confidence: 94%</p>
                  </div>
                </div>
                
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1E1E1E] via-transparent to-transparent opacity-40 pointer-events-none" />
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Features / Architecture Grid */}
        <section id="architecture" className="max-w-7xl mx-auto mb-24">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Enterprise-Grade Architecture</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Aethen-AI integrates seamlessly with your existing observability stack to provide deep, actionable insights without slowing down your runtime.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Database,
                title: "PostgreSQL",
                desc: "Robust relational storage for session metadata and high-level routing analytics.",
                delay: 0
              },
              {
                icon: LayoutDashboard,
                title: "Langfuse Integrations",
                desc: "Direct ingestion of execution traces, token usage, and latency metrics.",
                delay: 100
              },
              {
                icon: BrainCircuit,
                title: "LangGraph Diagnostics",
                desc: "Multi-agent orchestration to autonomously debug and identify root causes.",
                delay: 200
              },
              {
                icon: ScanSearch,
                title: "Pinecone Vector DB",
                desc: "Semantic search and RAG capabilities to identify similar past failures.",
                delay: 300
              }
            ].map((feature, i) => (
              <ScrollReveal key={i} delay={feature.delay}>
                <div className="h-full p-8 rounded-3xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300/40 backdrop-blur-md hover:bg-card/80 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/10 group cursor-default">
                  <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 text-primary">
                    <feature.icon className="size-7" />
                  </div>
                  <h3 className="font-bold text-xl mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 bg-muted/20 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 lg:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="size-8 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center font-bold text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                  Ae
                </div>
                <span className="font-bold tracking-tight text-xl">Aethen-AI</span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mb-6">
                The leading platform for diagnosing, understanding, and resolving AI agent failures in production environments.
              </p>
              <div className="flex items-center gap-4">
                <a href="#" className="p-2 bg-background border rounded-xl hover:bg-muted transition-colors"><Code className="size-4 text-foreground" /></a>
                <a href="#" className="p-2 bg-background border rounded-xl hover:bg-muted transition-colors"><Terminal className="size-4 text-foreground" /></a>
                <a href="#" className="p-2 bg-background border rounded-xl hover:bg-muted transition-colors"><Activity className="size-4 text-foreground" /></a>
                <a href="#" className="p-2 bg-background border rounded-xl hover:bg-muted transition-colors"><Globe className="size-4 text-foreground" /></a>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Features</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Integrations</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Pricing</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Changelog</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Documentation</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">API Reference</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Blog</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Community</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">About</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Customers</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Careers</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Aethen-AI Studio. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
