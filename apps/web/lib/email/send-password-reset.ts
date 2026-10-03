import { Resend } from "resend";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
) {
  const resend = getResendClient();
  const resetUrl =
    `${process.env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject: "Reset your NexusRAG password",

    html: `
      <h2>Reset your password</h2>

      <p>We received a request to reset your NexusRAG password.</p>

      <p>
        <a href="${resetUrl}">
          Reset password
        </a>
      </p>

      <p>This link expires in 15 minutes.</p>

      <p>If you didn't request this, you can ignore this email.</p>
    `,
  });
}