"use client";

import React, { useState, useEffect } from "react";

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
    // Check for reset token in URL
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

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center space-x-3 mb-6">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-primary to-primary-hover flex items-center justify-center shadow-lg shadow-primary/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-ink tracking-tight">HookShield</h2>
        </div>
        <h2 className="mt-2 text-center text-xl font-bold tracking-tight text-ink">
          {mode === "login" && "Sign in to your account"}
          {mode === "register" && "Create your account"}
          {mode === "forgot_password" && "Reset your password"}
          {mode === "reset_password" && "Set new password"}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface-1 py-8 px-4 shadow-xl shadow-black/50 border border-hairline sm:rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm">
                {error}
              </div>
            )}
            {message && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3 text-emerald-400 text-sm">
                {message}
              </div>
            )}

            {(mode === "login" || mode === "register" || mode === "forgot_password") && (
              <div>
                <label className="block text-sm font-medium text-ink-muted">Email address</label>
                <div className="mt-1">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-md border border-hairline bg-surface-2 px-3 py-2 text-ink placeholder-ink-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm"
                    placeholder="developer@acme.co"
                  />
                </div>
              </div>
            )}

            {(mode === "login" || mode === "register" || mode === "reset_password") && (
              <div>
                <label className="block text-sm font-medium text-ink-muted">
                  {mode === "reset_password" ? "New Password" : "Password"}
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-md border border-hairline bg-surface-2 px-3 py-2 text-ink placeholder-ink-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm"
                    placeholder="••••••••"
                  />
                </div>
                {mode === "register" && (
                    <p className="mt-2 text-xs text-ink-subtle">
                        Password must be at least 8 characters, contain 1 number and 1 special character.
                    </p>
                )}
              </div>
            )}

            {mode === "login" && (
                <div className="flex items-center justify-end">
                    <div className="text-sm">
                        <button type="button" onClick={() => setMode("forgot_password")} className="font-medium text-primary hover:text-primary-hover transition-colors">
                            Forgot your password?
                        </button>
                    </div>
                </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md border border-transparent bg-primary py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {loading && "Processing..."}
                {!loading && mode === "login" && "Sign in"}
                {!loading && mode === "register" && "Register"}
                {!loading && mode === "forgot_password" && "Send Reset Link"}
                {!loading && mode === "reset_password" && "Reset Password"}
              </button>
            </div>
          </form>

          {(mode === "login" || mode === "register") && (
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-hairline" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-surface-1 px-2 text-ink-subtle">Or continue with</span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleOAuth('google')}
                    className="flex w-full items-center justify-center gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm font-semibold text-ink shadow-sm ring-1 ring-inset ring-hairline hover:bg-surface-3 transition-colors"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-sm font-medium">Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth('github')}
                    className="flex w-full items-center justify-center gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm font-semibold text-ink shadow-sm ring-1 ring-inset ring-hairline hover:bg-surface-3 transition-colors"
                  >
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    <span className="text-sm font-medium">GitHub</span>
                  </button>
                </div>
              </div>
          )}

          <div className="mt-6 flex justify-center text-sm">
            {(mode === "login" || mode === "forgot_password") && (
                <button type="button" onClick={() => setMode("register")} className="font-medium text-primary hover:text-primary-hover transition-colors">
                    Don't have an account? Sign up
                </button>
            )}
            {mode === "register" && (
                <button type="button" onClick={() => setMode("login")} className="font-medium text-primary hover:text-primary-hover transition-colors">
                    Already have an account? Sign in
                </button>
            )}
            {mode === "reset_password" && (
                <button type="button" onClick={() => setMode("login")} className="font-medium text-primary hover:text-primary-hover transition-colors">
                    Back to Sign in
                </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
