import { Suspense } from "react";
import AuthClient from "./AuthClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-page">Loading...</div>}>
      <AuthClient />
    </Suspense>
  );
}
