"use client";

import { FormEvent, useState, useEffect } from "react";
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
} from "lucide-react";
import { useTheme } from "@/app/context/ThemeContext";

export default function ResetPasswordClient() {
  const { theme } = useTheme();
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
  const [tokenValidated, setTokenValidated] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing reset token. Please request a new reset link.");
    }
  }, [token]);

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
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
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

  if (!token) {
    return (
      <main className={`auth-page nexus-app ${theme === "light" ? "light-app" : ""}`}>
        <section className="auth-form-side">
          <button
            className="auth-theme-toggle"
            onClick={() => {}}
            aria-label="Theme toggle"
          />
          <div className="auth-form-wrap">
            <Link className="auth-back" href="/">
              <ArrowLeft size={14} />
              Back to home
            </Link>
            <span className="auth-kicker">ACCOUNT RECOVERY</span>
            <h2>Reset your password</h2>
            <p className="auth-subtitle">
              The reset link is invalid or has expired. Please request a new one.
            </p>
            <div className="auth-error" role="alert">
              <span><AlertCircle size={15} /></span>
              Invalid or missing reset token. Please request a new reset link.
            </div>
            <div className="auth-switch">
              <Link href="/login?mode=forgot">Request a new reset link</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

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
            <Lock size={16} />
            <span>Secure password reset. Your code stays yours.</span>
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
          onClick={() => {}}
          aria-label="Theme toggle"
        />
        <div className="auth-mobile-brand">
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
        </div>
        <div className="auth-form-wrap">
          <Link className="auth-back" href="/">
            <ArrowLeft size={14} />
            Back to home
          </Link>
          <span className="auth-kicker">ACCOUNT RECOVERY</span>
          <h2>Reset your password</h2>
          <p className="auth-subtitle">
            Enter your new password below. Make sure it's strong and unique.
          </p>
          {error && (
            <div className="auth-error" role="alert">
              <span><AlertCircle size={15} /></span>
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="auth-success" role="status">
              <span><Check size={15} /></span>
              {notice}
            </div>
          )}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              New password
              <div className="auth-input">
                <KeyRound size={15} />
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <KeyRound size={15} /> : <KeyRound size={15} />}
                </button>
              </div>
            </label>
            <label>
              Confirm new password
              <div className="auth-input">
                <KeyRound size={15} />
                <input
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirm your new password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <KeyRound size={15} /> : <KeyRound size={15} />}
                </button>
              </div>
            </label>
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={15} className="spin" />
                  Resetting...
                </>
              ) : (
                <>
                  Reset password
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
          <div className="auth-switch">
            Remembered your password?{" "}
            <Link href="/login" onClick={(e) => { e.preventDefault(); router.push("/login"); }}>
              Sign in
            </Link>
          </div>
          <div className="auth-secure">
            <Lock size={13} />
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