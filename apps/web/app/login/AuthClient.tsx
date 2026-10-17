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
import { Logo } from "@/components/app/brand";
import { cn } from "@/lib/utils";

const inputCls =
  "flex h-11 items-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3.5 text-[13.5px] text-[var(--nx-ink)] transition-colors focus-within:border-[var(--nx-ink)]";

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
      ? "Create your account"
      : "Welcome back.";
  const submitLabel = isForgot ? "Send reset link" : isSignup ? "Create account" : "Sign in";
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
        const res = await fetch("/api/auth/forget-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send reset link");
        setNotice("If an account exists for that email, a reset link has been sent.");
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
    <main className="grid min-h-screen bg-[var(--nx-bg)] text-[var(--nx-ink)] lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r border-[var(--nx-border)] bg-[var(--nx-surface)] p-10 lg:flex">
        <Link href="/" aria-label="NexusRAG home">
          <Logo />
        </Link>
        <div className="max-w-[440px]">
          <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
            The context layer for your code
          </p>
          <h1 className="font-display mt-3 text-[clamp(30px,3.4vw,44px)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance">
            Make your entire codebase conversational.
          </h1>
          <p className="mt-3 max-w-[40ch] text-[14px] leading-relaxed text-[var(--nx-muted)]">
            One calm place to understand, search, and reason across every repository your team
            builds.
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-border)] font-mono text-[11px]">
            {[
              ["DOC → CHUNK", "Tree-sitter code-aware chunks"],
              ["VECTOR · LEXICAL · GRAPH", "Hybrid retrieval, fused"],
              ["ANSWER + [S1]", "Every claim cited to a file"],
            ].map((row) => (
              <div
                key={row[0]}
                className="flex items-center justify-between gap-3 bg-[var(--nx-surface)] px-4 py-3"
              >
                <span className="text-[var(--nx-ink)]">{row[0]}</span>
                <span className="truncate text-[var(--nx-faint)]">{row[1]}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 text-[12.5px] text-[var(--nx-muted)]">
            <ShieldCheck size={15} />
            Private by design. Grounded in your source.
          </p>
        </div>
        <p className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
          <span>© 2026 NexusRAG</span>
          <span>Retrieval first · Grounded always</span>
        </p>
      </section>

      <section className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-[12.5px] text-[var(--nx-muted)] hover:bg-[var(--nx-raised)] hover:text-[var(--nx-ink)] lg:hidden"
          >
            <Logo />
          </Link>
          <Link
            href="/"
            className="hidden items-center gap-1.5 text-[12.5px] text-[var(--nx-muted)] hover:text-[var(--nx-ink)] lg:inline-flex"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="grid size-9 place-items-center rounded-xl border border-[var(--nx-border)] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <p className="font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
            {isForgot
              ? "Account recovery"
              : isSignup
                ? "Start your workspace"
                : "Sign in to your workspace"}
          </p>
          <h2 className="font-display mt-2 text-[30px] font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
            {isForgot
              ? "Enter the email tied to your account and we'll send you a secure reset link."
              : isSignup
                ? "Create an account to start exploring your code with context."
                : "Pick up where you left off. Your repositories are waiting."}
          </p>

          {error && (
            <div
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] px-3.5 py-3 text-[13px] text-[var(--nx-bad)]"
              role="alert"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {notice && !error && (
            <div
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3.5 py-3 text-[13px] text-[var(--nx-ink)]"
              role="status"
            >
              <Check size={15} className="mt-0.5 shrink-0" />
              <span>
                {notice}
                {isForgot && (
                  <button
                    onClick={() => setNotice("")}
                    className="ml-2 underline underline-offset-2"
                  >
                    Try another email
                  </button>
                )}
              </span>
            </div>
          )}

          {!isForgot && (
            <>
              <button
                onClick={() => {
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/api/auth/github";
                }}
                disabled={loading}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] text-[13.5px] font-semibold transition-colors hover:border-[var(--nx-border-strong)] disabled:opacity-50"
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
              <div className="my-5 flex items-center gap-3 font-mono text-[10px] tracking-[0.14em] text-[var(--nx-faint)] uppercase">
                <span className="h-px flex-1 bg-[var(--nx-border)]" />
                or continue with email
                <span className="h-px flex-1 bg-[var(--nx-border)]" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className={cn("grid gap-3", isForgot && "mt-5")}>
            {isSignup && (
              <label className="block text-[12.5px] font-semibold">
                Full name
                <div className={cn(inputCls, "mt-1.5")}>
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Your name"
                    required
                    className="w-full bg-transparent outline-none placeholder:text-[var(--nx-faint)]"
                  />
                </div>
              </label>
            )}
            <label className="block text-[12.5px] font-semibold">
              Email address
              <div className={cn(inputCls, "mt-1.5")}>
                <Mail size={15} className="shrink-0 text-[var(--nx-faint)]" />
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  className="w-full bg-transparent outline-none placeholder:text-[var(--nx-faint)]"
                />
              </div>
            </label>
            {!isForgot && (
              <label className="block text-[12.5px] font-semibold">
                Password
                <div className={cn(inputCls, "mt-1.5")}>
                  <KeyRound size={15} className="shrink-0 text-[var(--nx-faint)]" />
                  <input
                    name="password"
                    type="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    placeholder={isSignup ? "At least 8 characters" : "Enter your password"}
                    minLength={8}
                    required
                    className="w-full bg-transparent outline-none placeholder:text-[var(--nx-faint)]"
                  />
                </div>
              </label>
            )}
            {!isForgot && !isSignup && (
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-[var(--nx-faint)]">
                  Protected by rate limits + CSRF checks.
                </span>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="font-medium underline underline-offset-2 hover:text-[var(--nx-muted)]"
                >
                  Forgot password?
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--nx-signal)] text-[13.5px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {submitLabel}
                </>
              ) : (
                <>
                  {submitLabel}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-[var(--nx-muted)]">
            {isForgot ? (
              <>
                Remembered your password?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="font-semibold text-[var(--nx-ink)] hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : isSignup ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="font-semibold text-[var(--nx-ink)] hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New to NexusRAG?{" "}
                <button
                  onClick={() => switchMode("signup")}
                  className="font-semibold text-[var(--nx-ink)] hover:underline"
                >
                  Create an account
                </button>
              </>
            )}
          </p>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-[var(--nx-faint)]">
            <ShieldCheck size={13} />
            Your code stays yours. NexusRAG never trains on private repositories.
          </p>
        </div>

        <p className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-[var(--nx-faint)] uppercase">
          <span>© 2026 NexusRAG</span>
          <a href="mailto:hello@nexusrag.dev" className="hover:text-[var(--nx-ink)]">
            Need help?
          </a>
        </p>
      </section>
    </main>
  );
}
