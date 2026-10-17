import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-page">Loading...</div>}>
      <ResetPasswordClient />
    </Suspense>
  );
}
