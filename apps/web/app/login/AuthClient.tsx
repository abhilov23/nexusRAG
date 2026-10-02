"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useTheme } from "@/app/context/ThemeContext";
import { useSearchParams, useRouter } from "next/navigation";

export default function AuthPage() {
  const { theme, toggleTheme } = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode =
    searchParams.get("mode") === "signup"
      ? "signup"
      : searchParams.get("mode") === "forgot"
      ? "forgot"
      : "login";
  const redirect = searchParams.get("redirect") || "/workspace";
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isForgot = mode === "forgot";
  const isSignup = mode === "signup";
  const title = isForgot
    ? "Reset your password"
    : isSignup
    ? "Build with your codebase."
    : "Welcome back.";
  const submitLabel = isForgot
    ? "Send reset link"
    : isSignup
    ? "Create account"
    : "Sign in";
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string | undefined;

    try {
      if (isSignup) {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Signup failed");
        setNotice("Account created successfully. Signing you in...");
        await handleLogin(email, password, redirect);
      } else if (isForgot) {
        setNotice("If an account exists for that email, a reset link is on its way.");
      } else {
        await handleLogin(email, password, redirect);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string, redirectTo: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    router.push(redirectTo);
    router.refresh();
  };

  const switchMode = (newMode: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("mode", newMode);
    router.push(`/login?${params.toString()}`);
  };

  return (
    <main className={`auth-page nexus-app ${theme === "light" ? "light-app" : ""}`}>
      <section className="auth-story">
        <Link className="auth-brand" href="/">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            nexus<span>rag</span>
          </span>
        </Link>
        <div className="auth-story-content">
          <span className="auth-overline">THE CONTEXT LAYER FOR YOUR CODE</span>
          <h1>
            Make your entire codebase <em>conversational.</em>
          </h1>
          <p>
            One calm place to understand, search, and reason across every
            repository your team builds.
          </p>
          <div className="auth-story-rule" />
          <div className="auth-proof">
            <ShieldCheck size={16} />
            <span>Private by design. Grounded in your source.</span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>© 2025 NexusRAG</span>
          <span>Built for curious teams.</span>
        </div>
        <div className="auth-graphic">
          <div className="graphic-ring ring-a" />
          <div className="graphic-ring ring-b" />
          <div className="graphic-ring ring-c" />
          <span className="graphic-node node-a" />
          <span className="graphic-node node-b" />
          <span className="graphic-node node-c" />
        </div>
      </section>
      <section className="auth-form-side">
        <button
          className="auth-theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <div className="auth-mobile-brand">
          <Link className="auth-brand" href="/">
            <span className="brand-mark">
              <span />
              <span />
            </span>
            <span>
              nexus<span>rag</span>
            </span>
          </Link>
        </div>
        <div className="auth-form-wrap">
          <Link className="auth-back" href="/">
            <ArrowLeft size={14} />
            Back to home
          </Link>
          <span className="auth-kicker">
            {isForgot
              ? "ACCOUNT RECOVERY"
              : isSignup
              ? "START YOUR WORKSPACE"
              : "SIGN IN TO YOUR WORKSPACE"}
          </span>
          <h2>{title}</h2>
          <p className="auth-subtitle">
            {isForgot
              ? "Enter the email tied to your account and we'll send you a secure reset link."
              : isSignup
              ? "Create an account to start exploring your code with context."
              : "Pick up where you left off. Your repositories are waiting."}
          </p>
          {error && (
            <div className="auth-error" role="alert">
              <span>
                <AlertCircle size={15} />
              </span>
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="auth-success" role="status">
              <span>
                <Check size={15} />
              </span>
              {notice}
              {isForgot && (
                <button onClick={() => setNotice("")}>Try another email</button>
              )}
            </div>
          )}
          {!isForgot && (
            <>
              <button
                className="github-button"
                onClick={() =>
                  setError(
                    "GitHub sign-in will be available when authentication is connected.",
                  )
                }
                disabled={loading}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="17"
                  height="17"
                  fill="currentColor"
                >
                  <path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.06c-3.1.67-3.76-1.32-3.76-1.32-.5-1.29-1.24-1.63-1.24-1.63-1.01-.7.08-.69.08-.69 1.12.08 1.71 1.15 1.71 1.15 1 .1.82 2.01 3.11 1.52.1-.72.4-1.21.72-1.49-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.21 1.15-2.99-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.12-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.11 2.96.72.78 1.15 1.77 1.15 2.99 0 4.29-2.62 5.23-5.11 5.51.4.35.76 1.03.76 2.08V22c0 .29.2.63.77.52A11.1 11.1 0 0 0 12 .9Z" />
                </svg>
                Continue with GitHub
              </button>
              <div className="auth-divider">
                <span />
                or continue with email
                <span />
              </div>
            </>
          )}
          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <label>
                Full name
                <div className="auth-input">
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Your name"
                    required
                  />
                </div>
              </label>
            )}
            <label>
              Email address
              <div className="auth-input">
                <Mail size={15} />
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </label>
            {!isForgot && (
              <label>
                Password
                <div className="auth-input">
                  <KeyRound size={15} />
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      isSignup ? "new-password" : "current-password"
                    }
                    placeholder={
                      isSignup
                        ? "At least 8 characters"
                        : "Enter your password"
                    }
                    minLength={8}
                    required
                  />
                </div>
              </label>
            )}
            {!isForgot && !isSignup && (
              <div className="auth-inline">
                <label className="remember-option">
                  <input type="checkbox" /> Remember me
                </label>
                <Link href="/login?mode=forgot">Forgot password?</Link>
              </div>
            )}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={15} className="spin" />
                  {submitLabel}
                </>
              ) : (
                <>
                  {submitLabel}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
            {isSignup && (
              <p className="auth-terms">
                By creating an account, you agree to our{" "}
                <button type="button">Terms</button> and{" "}
                <button type="button">Privacy Policy</button>.
              </p>
            )}
          </form>
          <div className="auth-switch">
            {isForgot ? (
              <>
                Remembered your password?{" "}
                <Link href="/login" onClick={(e) => { e.preventDefault(); switchMode("login"); }}>
                  Sign in
                </Link>
              </>
            ) : isSignup ? (
              <>
                Already have an account?{" "}
                <Link href="/login" onClick={(e) => { e.preventDefault(); switchMode("login"); }}>
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to NexusRAG?{" "}
                <Link href="/login?mode=signup" onClick={(e) => { e.preventDefault(); switchMode("signup"); }}>
                  Create an account
                </Link>
              </>
            )}
          </div>
          <div className="auth-secure">
            <ShieldCheck size={13} />
            Your code stays yours. NexusRAG never trains on private
            repositories.
          </div>
        </div>
        <footer className="auth-form-footer">
          <span>© 2025 NexusRAG</span>
          <a href="mailto:hello@nexusrag.dev">Need help?</a>
        </footer>
      </section>
    </main>
  );
}