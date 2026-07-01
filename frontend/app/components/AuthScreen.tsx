"use client";

import React, { useState, useEffect } from "react";
import TechBackground from "./TechBackground";
import HeroScene from "./HeroScene";
import Tilt from "react-parallax-tilt";

type AuthMode = "login" | "register" | "forgot_password" | "reset_password";

export default function AuthScreen({ onLogin }: { onLogin: (apiKey: string, email: string) => void }) {
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

  const features = [
    {
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
      title: "Webhook Proxy",
      desc: "Intercept, validate & forward webhooks through a secure resilient layer",
    },
    {
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
      title: "Smart Retries",
      desc: "Exponential backoff with configurable retry policies and dead-letter queues",
    },
    {
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
      title: "Live Analytics",
      desc: "Real-time metrics, latency tracking, success rates & throughput charts",
    },
    {
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
      title: "Incident Board",
      desc: "Kanban-style issue tracking with priority management & team assignment",
    },
  ];

  return (
    <div className="min-h-screen bg-canvas flex relative overflow-hidden">
      {/* Global particle background */}
      <TechBackground />

      {/* LEFT: Hero / Branding Panel */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-center items-center p-12 xl:p-16">
        {/* 3D animated objects scene */}
        <div className="absolute inset-0 z-0">
          <HeroScene />
        </div>

        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-br from-canvas/80 via-canvas/40 to-transparent" />

        {/* Branding content */}
        <div className="relative z-10 max-w-xl">
          {/* Logo */}
          <div className="flex items-center space-x-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">HookShield</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl xl:text-5xl font-bold text-white tracking-tight leading-[1.1] mb-5">
            Never lose a
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-400 bg-clip-text text-transparent">
              webhook again.
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-base xl:text-lg text-white/60 leading-relaxed mb-10 max-w-md">
            Webhooks fail silently. Endpoints go down. Payloads get lost.
            HookShield proxies every webhook through a resilient layer with
            automatic retries, live monitoring, and incident management —
            so you can sleep at night.
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((f) => (
              <Tilt
                key={f.title}
                tiltMaxAngleX={12}
                tiltMaxAngleY={12}
                scale={1.03}
                transitionSpeed={2000}
                perspective={800}
                className="h-full"
              >
                <div
                  className="flex items-start space-x-3 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3.5 backdrop-blur-sm hover:bg-white/[0.07] hover:border-white/[0.15] transition-all duration-300 h-full [transform-style:preserve-3d]"
                >
                  <div className="mt-0.5 text-white/50 shrink-0 [transform:translateZ(25px)]">{f.icon}</div>
                  <div className="[transform:translateZ(20px)]">
                    <h3 className="text-sm font-semibold text-white/90">{f.title}</h3>
                    <p className="text-[11px] text-white/40 leading-snug mt-0.5">{f.desc}</p>
                  </div>
                </div>
              </Tilt>
            ))}
          </div>


          {/* Stats row */}
          <div className="mt-10 flex items-center space-x-8">
            <div>
              <p className="text-2xl font-bold text-white/90 tracking-tight">99.9%</p>
              <p className="text-[11px] text-white/35 mt-0.5">Delivery uptime</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white/90 tracking-tight">&lt;50ms</p>
              <p className="text-[11px] text-white/35 mt-0.5">Proxy overhead</p>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white/90 tracking-tight">Zero</p>
              <p className="text-[11px] text-white/35 mt-0.5">Lost payloads</p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Auth Form Panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 py-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex items-center justify-center space-x-3 mb-8">
            <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">HookShield</span>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-ink tracking-tight">
              {mode === "login" && "Welcome back"}
              {mode === "register" && "Create your account"}
              {mode === "forgot_password" && "Reset your password"}
              {mode === "reset_password" && "Set new password"}
            </h2>
            <p className="text-sm text-ink-subtle mt-2">
              {mode === "login" && "Sign in to access your webhook dashboard."}
              {mode === "register" && "Start protecting your webhooks in under 2 minutes."}
              {mode === "forgot_password" && "We'll send a reset link to your email."}
              {mode === "reset_password" && "Choose a strong password for your account."}
            </p>
          </div>

          {/* Auth card with subtle animated border */}
          <Tilt
            tiltMaxAngleX={5}
            tiltMaxAngleY={5}
            scale={1.01}
            transitionSpeed={2500}
            perspective={1200}
            glareEnable={true}
            glareMaxOpacity={0.08}
            glarePosition="all"
          >
            <div className="bg-surface-1/80 backdrop-blur-md py-8 px-6 shadow-2xl shadow-black/40 border border-hairline rounded-xl relative overflow-hidden [transform-style:preserve-3d]">
              {/* Animated gradient accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: "shimmer 3s ease-in-out infinite" }} />
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm flex items-start space-x-2">
                  <span className="shrink-0 mt-0.5">✕</span>
                  <span>{error}</span>
                </div>
              )}
              {message && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-emerald-400 text-sm flex items-start space-x-2">
                  <span className="shrink-0 mt-0.5">✓</span>
                  <span>{message}</span>
                </div>
              )}

              {(mode === "login" || mode === "register" || mode === "forgot_password") && (
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-lg border border-hairline bg-surface-2 px-3.5 py-2.5 text-ink placeholder-ink-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm transition-colors"
                    placeholder="developer@acme.co"
                  />
                </div>
              )}

              {(mode === "login" || mode === "register" || mode === "reset_password") && (
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1.5">
                    {mode === "reset_password" ? "New Password" : "Password"}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg border border-hairline bg-surface-2 px-3.5 py-2.5 text-ink placeholder-ink-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm transition-colors"
                    placeholder="••••••••"
                  />
                  {mode === "register" && (
                    <p className="mt-2 text-xs text-ink-subtle">
                      Min 8 characters, 1 number and 1 special character.
                    </p>
                  )}
                </div>
              )}

              {mode === "login" && (
                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => setMode("forgot_password")} className="text-sm font-medium text-primary hover:text-primary-hover transition-colors">
                    Forgot your password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-lg bg-primary py-2.5 px-4 text-sm font-semibold text-black shadow-lg shadow-primary/20 hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
              >
                {loading && (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                )}
                {loading ? "Processing..." :
                  mode === "login" ? "Sign in" :
                  mode === "register" ? "Create account" :
                  mode === "forgot_password" ? "Send Reset Link" :
                  "Reset Password"}
              </button>
            </form>

            {(mode === "login" || mode === "register") && (
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-hairline" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-surface-1/80 px-3 text-ink-subtle text-xs">Or continue with</span>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleOAuth('google')}
                    className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-hairline hover:bg-surface-3 transition-all duration-200 active:scale-[0.98]"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth('github')}
                    className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-hairline hover:bg-surface-3 transition-all duration-200 active:scale-[0.98]"
                  >
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    GitHub
                  </button>
                </div>
              </div>
            )}

            {/* Mode toggle links */}
            <div className="mt-6 flex justify-center text-sm">
              {(mode === "login" || mode === "forgot_password") && (
                <button type="button" onClick={() => setMode("register")} className="font-medium text-primary hover:text-primary-hover transition-colors">
                  Don&apos;t have an account? <span className="underline underline-offset-2">Sign up</span>
                </button>
              )}
              {mode === "register" && (
                <button type="button" onClick={() => setMode("login")} className="font-medium text-primary hover:text-primary-hover transition-colors">
                  Already have an account? <span className="underline underline-offset-2">Sign in</span>
                </button>
              )}
              {mode === "reset_password" && (
                <button type="button" onClick={() => setMode("login")} className="font-medium text-primary hover:text-primary-hover transition-colors">
                  Back to Sign in
                </button>
              )}
            </div>
          </div>
          </Tilt>
        </div>
      </div>

      {/* Shimmer animation keyframe */}
      <style jsx global>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.3; transform: translateX(-100%); }
          50% { opacity: 1; transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
