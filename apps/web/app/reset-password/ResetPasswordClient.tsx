"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  AlertCircle,
  Lock,
  Moon,
  Sun,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTheme } from "@/app/context/ThemeContext";
import { Logo } from "@/components/app/brand";

const inputCls =
  "flex h-11 items-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-surface)] px-3.5 text-[13.5px] text-[var(--nx-ink)] transition-colors focus-within:border-[var(--nx-ink)]";

export default function ResetPasswordClient() {
  const { theme, toggleTheme } = useTheme();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(pwd)) return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(pwd)) return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(pwd)) return "Password must contain at least one number";
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!token) {
      setError("Invalid or missing reset token");
      return;
    }

    const pwdError = validatePassword(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Password reset failed");
      setNotice("Password has been reset successfully. Redirecting to login...");
      setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--nx-bg)] px-5 py-10 text-[var(--nx-ink)]">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="NexusRAG home">
            <Logo />
          </Link>
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="grid size-9 place-items-center rounded-xl border border-[var(--nx-border)] text-[var(--nx-muted)] hover:border-[var(--nx-border-strong)] hover:text-[var(--nx-ink)]"
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-[var(--nx-border)] bg-[var(--nx-surface)] p-6 sm:p-7">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--nx-muted)] hover:text-[var(--nx-ink)]"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>
          <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-[var(--nx-faint)] uppercase">
            Account recovery
          </p>
          <h1 className="font-display mt-1.5 text-[24px] font-semibold tracking-tight">
            Reset your password
          </h1>

          {!token ? (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--nx-muted)]">
                The reset link is invalid or has expired. Please request a new one.
              </p>
              <div
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] px-3.5 py-3 text-[13px] text-[var(--nx-bad)]"
                role="alert"
              >
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                Invalid or missing reset token. Please request a new reset link.
              </div>
              <Link
                href="/login?mode=forgot"
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--nx-signal)] text-[13.5px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85"
              >
                Request a new reset link
                <ArrowRight size={15} />
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--nx-muted)]">
                Enter your new password below. Make sure it&apos;s strong and unique.
              </p>
              {error && (
                <div
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-[var(--nx-bad)] bg-[color-mix(in_srgb,var(--nx-bad)_8%,transparent)] px-3.5 py-3 text-[13px] text-[var(--nx-bad)]"
                  role="alert"
                >
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
              {notice && !error && (
                <div
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-raised)] px-3.5 py-3 text-[13px] text-[var(--nx-ink)]"
                  role="status"
                >
                  <Check size={15} className="mt-0.5 shrink-0" />
                  {notice}
                </div>
              )}
              <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
                {[
                  {
                    label: "New password",
                    name: "password",
                    value: password,
                    set: setPassword,
                    show: showPassword,
                    setShow: setShowPassword,
                  },
                  {
                    label: "Confirm new password",
                    name: "confirmPassword",
                    value: confirmPassword,
                    set: setConfirmPassword,
                    show: showConfirmPassword,
                    setShow: setShowConfirmPassword,
                  },
                ].map((f) => (
                  <label key={f.name} className="block text-[12.5px] font-semibold">
                    {f.label}
                    <div className={`${inputCls} mt-1.5`}>
                      <KeyRound size={15} className="shrink-0 text-[var(--nx-faint)]" />
                      <input
                        name={f.name}
                        type={f.show ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        minLength={8}
                        required
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        disabled={loading}
                        className="w-full bg-transparent outline-none placeholder:text-[var(--nx-faint)]"
                      />
                      <button
                        type="button"
                        onClick={() => f.setShow(!f.show)}
                        aria-label={f.show ? "Hide password" : "Show password"}
                        className="shrink-0 text-[var(--nx-faint)] hover:text-[var(--nx-ink)]"
                      >
                        {f.show ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </label>
                ))}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--nx-signal)] text-[13.5px] font-semibold text-[var(--nx-signal-ink)] transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Resetting…
                    </>
                  ) : (
                    <>
                      Reset password
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
              <p className="mt-4 text-center text-[13px] text-[var(--nx-muted)]">
                Remembered your password?{" "}
                <Link href="/login" className="font-semibold text-[var(--nx-ink)] hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-[var(--nx-faint)]">
          <Lock size={12} />
          Your code stays yours. NexusRAG never trains on private repositories.
        </p>
      </div>
    </main>
  );
}
