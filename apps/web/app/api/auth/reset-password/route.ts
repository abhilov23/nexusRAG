// app/api/auth/reset-password/route.ts

import crypto from "crypto";
import { NextResponse } from "next/server";

import { db } from "@repo/database";
import {redis} from "@repo/redis";
import { hashPassword } from "@/lib/auth/password";

export async function POST(req: Request) {
  const { token, newPassword } = await req.json();

  if (!token || !newPassword) {
    return NextResponse.json(
      { error: "Token and password are required" },
      { status: 400 }
    );
  }

  // 1. Hash the received token
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  // 2. Check Redis
  const userId = await redis.get(
    `password-reset:${tokenHash}`
  );

  if (!userId) {
    return NextResponse.json(
      { error: "Invalid or expired reset link" },
      { status: 400 }
    );
  }

  // 3. Hash the new password
  const passwordHash = await hashPassword(newPassword);

  // 4. Update PostgreSQL
  await db.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash,
    },
  });

  // 5. Consume the reset token
  await redis.del(
    `password-reset:${tokenHash}`
  );

  return NextResponse.json({
    message: "Password reset successfully",
  });
}