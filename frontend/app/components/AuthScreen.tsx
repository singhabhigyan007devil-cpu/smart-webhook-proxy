"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HeroScene from "./HeroScene";
import ArchitectureScene from "./ArchitectureScene";
import OutcomeScene from "./OutcomeScene";

type AuthMode = "login" | "register" | "forgot_password" | "reset_password";

export default function AuthScreen({ onLogin }: { onLogin: (apiKey: string, email: string) => void }) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      if (token) {
        setResetToken(token);
        setMode("reset_password");
        setShowAuthModal(true);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "login" || mode === "register") {
        const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
        const res = await fetch(`http://localhost:8000${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const data = await res.json();
          let errMsg = data.detail || "Authentication failed";
          if (Array.isArray(data.detail)) {
            errMsg = data.detail.map((err: any) => err.msg || JSON.stringify(err)).join(", ");
          } else if (typeof data.detail === "object") {
            errMsg = data.detail.msg || JSON.stringify(data.detail);
          }
          throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
        }
        const data = await res.json();
        onLogin(data.api_key, data.email);

      } else if (mode === "forgot_password") {
        const res = await fetch(`http://localhost:8000/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) {
          let errMsg = data.detail || "Request failed";
          if (Array.isArray(data.detail)) {
            errMsg = data.detail.map((err: any) => err.msg || JSON.stringify(err)).join(", ");
          } else if (typeof data.detail === "object") {
            errMsg = data.detail.msg || JSON.stringify(data.detail);
          }
          throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
        }
        setMessage(data.message);

      } else if (mode === "reset_password") {
        const res = await fetch(`http://localhost:8000/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, new_password: password }),
        });
        const data = await res.json();
        if (!res.ok) {
          let errMsg = data.detail || "Reset failed";
          if (Array.isArray(data.detail)) {
            errMsg = data.detail.map((err: any) => err.msg || JSON.stringify(err)).join(", ");
          } else if (typeof data.detail === "object") {
            errMsg = data.detail.msg || JSON.stringify(data.detail);
          }
          throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
        }
        setMessage(data.message);
        setTimeout(() => setMode("login"), 2000);
      }
    } catch (err: any) {
      setError(typeof err.message === 'string' ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: string) => {
    window.location.href = `http://localhost:8000/api/oauth/login/${provider}`;
  };

  const openAuth = (m: AuthMode = "login") => {
    setMode(m);
    setShowAuthModal(true);
  };

  const features = [
    {
      title: "Resilient Webhook Proxy",
      desc: "Intercept, validate, and forward webhooks through a highly available buffer layer.",
      icon: (
        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      title: "Smart Exponential Retries",
      desc: "Configure exponential backoff policies and dead-letter queues to gracefully handle destination downtime.",
      icon: (
        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )
    },
    {
      title: "Real-time Insight Analytics",
      desc: "Visualize payload success rates, latency distributions, and throughput in beautiful dashboards.",
      icon: (
        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2.243a2 2 0 011.96 1.608l1.04 5.204a2 2 0 003.914 0l2.696-13.48a2 2 0 013.914 0l1.04 5.204A2 2 0 0021.757 13H24" />
        </svg>
      )
    },
    {
      title: "Incident Command Board",
      desc: "Automatically track failing endpoints with Kanban-style boards, alerting, and team assignments.",
      icon: (
        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
  ];

  const companies = [
    "ACME Corp", "Globex", "Soylent", "Initech", "Umbrella", "Stark Ind"
  ];

  return (
    <div className="min-h-screen bg-canvas font-sans selection:bg-white selection:text-black text-white overflow-y-auto overflow-x-hidden relative">
      {/* Global Header */}
      <header className="fixed top-0 inset-x-0 h-16 z-40 border-b border-white/[0.05] bg-black/50 backdrop-blur-md flex items-center justify-between px-8">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/20 shadow-sm shadow-white/5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-bold tracking-tight text-lg">HookShield</span>
        </div>
        <div className="flex items-center space-x-6">
          <button onClick={() => openAuth("login")} className="text-sm font-medium text-white/70 hover:text-white transition-colors">Log in</button>
          <button onClick={() => openAuth("register")} className="text-sm font-medium bg-white text-black px-4 py-1.5 rounded-full hover:bg-gray-200 transition-colors">Start free</button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-16">
        <div className="absolute inset-0 z-0">
          <HeroScene />
        </div>
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-transparent via-black/40 to-black pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center max-w-4xl px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="inline-flex items-center space-x-2 bg-white/[0.03] border border-white/10 rounded-full px-4 py-1.5 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-medium text-white/80">HookShield Enterprise 2.0 is now live</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }} className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            The proxy layer for <br className="hidden md:block" />
            <span className="text-white/60">mission-critical webhooks.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="text-lg md:text-xl text-white/50 max-w-2xl mb-10 leading-relaxed">
            Eliminate silent failures. HookShield buffers, validates, and securely forwards millions of incoming webhook events to your infrastructure with mathematical precision.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }} className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <button onClick={() => openAuth("register")} className="h-12 px-8 bg-white text-black rounded-full font-semibold hover:bg-gray-200 transition-colors flex items-center space-x-2">
              <span>Start protecting</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="h-12 px-8 bg-white/5 text-white border border-white/10 rounded-full font-semibold hover:bg-white/10 transition-colors">
              Explore features
            </button>
          </motion.div>
        </div>
      </section>

      {/* Logo Cloud */}
      <section className="py-20 border-b border-t border-white/[0.05] bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs font-medium text-white/40 uppercase tracking-widest mb-10">Trusted by engineering teams at</p>
          <div className="flex flex-wrap justify-center items-center gap-10 md:gap-20 opacity-50 grayscale">
            {companies.map(c => (
              <div key={c} className="text-xl md:text-2xl font-bold tracking-tighter">{c}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bento */}
      <section id="features" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-20 max-w-3xl">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">A complete webhook infrastructure.</h2>
            <p className="text-lg text-white/50 leading-relaxed">Stop building custom retry logic and dead-letter queues. HookShield provides a globally distributed ingestion layer that secures and guarantees payload delivery.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <div key={i} className="group relative bg-white/[0.02] border border-white/[0.05] rounded-3xl p-8 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500 overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-white/[0.05] transition-colors duration-500" />
                <div className="h-12 w-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-6">
                  {f.icon}
                </div>
                <h3 className="text-2xl font-bold mb-3">{f.title}</h3>
                <p className="text-white/50 leading-relaxed max-w-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Demo Section */}
      <section className="py-32 bg-black relative border-t border-white/[0.05]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05)_0%,transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-20">
          <div className="flex-1 space-y-8 z-10">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Zero-config integration.</h2>
            <p className="text-lg text-white/50 leading-relaxed">
              Just update your provider's webhook URL to your HookShield endpoint. 
              We handle the signature verification, payload validation, and forwarding to your internal APIs automatically.
            </p>
            <ul className="space-y-4">
              {["Point Stripe/GitHub to HookShield", "We verify signatures & queue payloads", "We forward to your API with guaranteed delivery"].map((step, i) => (
                <li key={i} className="flex items-center space-x-3 text-white/80">
                  <div className="flex items-center justify-center h-6 w-6 rounded-full border border-white/20 bg-white/5 text-xs font-mono">{i+1}</div>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 w-full z-10">
            <div className="rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl overflow-hidden">
              <div className="h-12 border-b border-white/10 flex items-center px-4 space-x-2">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
                <div className="ml-4 text-xs font-mono text-white/30">terminal</div>
              </div>
              <div className="p-6 font-mono text-sm leading-loose">
                <div className="text-white/40"># Create a new endpoint proxy</div>
                <div className="text-white"><span className="text-white/50">$</span> hookshield create --target https://api.yourapp.com/webhooks</div>
                <div className="text-white mt-2">✓ Proxy created successfully</div>
                <div className="text-white/60 mt-1">URL: https://proxy.hookshield.com/p/stripe-prod</div>
                
                <div className="text-white/40 mt-6"># Simulate a failed delivery attempt</div>
                <div className="text-white"><span className="text-white/50">$</span> hookshield trigger --status 500</div>
                <div className="text-white mt-2">⚠ Destination returned 500. Queued for exponential retry (attempt 1/10).</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Visualizer */}
      <section className="relative h-[600px] border-b border-t border-white/[0.05] bg-[#050505] overflow-hidden">
        <div className="absolute inset-0 z-0 mt-10">
          <ArchitectureScene />
        </div>
        <div className="absolute inset-0 z-[1] bg-gradient-to-r from-black via-transparent to-black pointer-events-none" />
        <div className="absolute top-10 inset-x-0 z-10 pointer-events-none px-6">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">Robust Webhook Pipeline</h2>
            <p className="text-white/50 max-w-xl text-sm md:text-base mx-auto">
              Incoming events are validated and securely buffered through our resilient proxy layer before guaranteed delivery.
            </p>
          </div>
        </div>
        <div className="absolute bottom-10 inset-x-0 z-10 pointer-events-none px-6">
          <div className="flex justify-between items-end w-full max-w-4xl mx-auto text-xs font-mono text-white/40 tracking-wider">
            <div className="text-left w-32">SOURCE<br/><span className="text-[10px] opacity-50">Any Provider</span></div>
            <div className="text-center w-32">HOOKSHIELD<br/><span className="text-[10px] opacity-50">Queue & Retry Engine</span></div>
            <div className="text-right w-32">DESTINATION<br/><span className="text-[10px] opacity-50">Your Internal API</span></div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 border-t border-white/[0.05] relative">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8">Ready to secure your webhooks?</h2>
          <p className="text-xl text-white/50 mb-10">Join engineering teams building resilient systems.</p>
          <button onClick={() => openAuth("register")} className="h-14 px-10 bg-white text-black rounded-full text-lg font-semibold hover:bg-gray-200 transition-colors inline-flex items-center space-x-2">
            <span>Create your account</span>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] py-12 text-center text-sm text-white/30 relative z-10">
        <p>© 2026 HookShield. All rights reserved.</p>
      </footer>

      {/* --- Auth Modal Overlay --- */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-surface-1 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <button onClick={() => setShowAuthModal(false)} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors z-20">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>

              <div className="relative p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {mode === "login" && "Welcome back"}
                    {mode === "register" && "Create account"}
                    {mode === "forgot_password" && "Reset password"}
                    {mode === "reset_password" && "Set new password"}
                  </h2>
                  <p className="text-sm text-white/50 mt-2">
                    {mode === "login" && "Sign in to access your dashboard."}
                    {mode === "register" && "Start protecting your webhooks."}
                    {mode === "forgot_password" && "We'll send a reset link."}
                    {mode === "reset_password" && "Choose a strong password."}
                  </p>
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-start space-x-2">
                      <span className="shrink-0 mt-0.5">✕</span><span>{error}</span>
                    </div>
                  )}
                  {message && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-emerald-400 text-sm flex items-start space-x-2">
                      <span className="shrink-0 mt-0.5">✓</span><span>{message}</span>
                    </div>
                  )}

                  {(mode === "login" || mode === "register" || mode === "forgot_password") && (
                    <div>
                      <label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-white/30 focus:bg-white/10 focus:outline-none transition-colors" placeholder="you@company.com" />
                    </div>
                  )}

                  {(mode === "login" || mode === "register" || mode === "reset_password") && (
                    <div>
                      <label className="block text-sm font-medium text-white/60 mb-1.5">{mode === "reset_password" ? "New Password" : "Password"}</label>
                      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-white/30 focus:bg-white/10 focus:outline-none transition-colors" placeholder="••••••••" />
                    </div>
                  )}

                  {mode === "login" && (
                    <div className="flex justify-end">
                      <button type="button" onClick={() => setMode("forgot_password")} className="text-sm text-white/50 hover:text-white transition-colors">Forgot password?</button>
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-black bg-white hover:bg-gray-200 transition-colors disabled:opacity-50 flex justify-center items-center">
                    {loading ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    ) : (
                      mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot_password" ? "Send link" : "Reset"
                    )}
                  </button>
                </form>

                {(mode === "login" || mode === "register") && (
                  <div className="mt-6">
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                      <div className="relative flex justify-center text-sm"><span className="bg-surface-1 px-3 text-white/40 text-xs">Or continue with</span></div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => handleOAuth('google')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm font-medium hover:bg-white/10 transition-colors">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Google
                      </button>
                      <button type="button" onClick={() => handleOAuth('github')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm font-medium hover:bg-white/10 transition-colors">
                        <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
                        GitHub
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-center text-sm">
                  {(mode === "login" || mode === "forgot_password") && (
                    <button type="button" onClick={() => setMode("register")} className="text-white/50 hover:text-white transition-colors">
                      Don't have an account? <span className="underline">Sign up</span>
                    </button>
                  )}
                  {mode === "register" && (
                    <button type="button" onClick={() => setMode("login")} className="text-white/50 hover:text-white transition-colors">
                      Already have an account? <span className="underline">Sign in</span>
                    </button>
                  )}
                  {mode === "reset_password" && (
                    <button type="button" onClick={() => setMode("login")} className="text-white/50 hover:text-white transition-colors">Back to Sign in</button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
