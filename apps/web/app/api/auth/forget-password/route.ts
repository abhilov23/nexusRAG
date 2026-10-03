import crypto from "crypto";
import { NextResponse } from "next/server";

import { db } from "@repo/database"; // use your actual DB package import
import {redis} from "@repo/redis";
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset";

const RESET_TOKEN_TTL = 15 * 60; // 15 minutes

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json({
        message:
          "If an account exists with that email, a password reset link has been sent.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    await redis.set(
      `password-reset:${tokenHash}`,
      user.id,
      "EX",
      RESET_TOKEN_TTL
    );

    await sendPasswordResetEmail(
      user.email,
      token
    );

    return NextResponse.json({
      message:
        "If an account exists with that email, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}