import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { db } from "@repo/database";

import { createSession } from "@/lib/auth/session";

type GitHubUser = {
  id: number;
  name: string | null;
  email: string | null;
};

type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  try {

    const code = request.nextUrl.searchParams.get("code");
    const returnedState = request.nextUrl.searchParams.get("state");

    const storedState =
      cookieStore.get("github_oauth_state")?.value;

    // One-time state: remove it immediately
    cookieStore.delete("github_oauth_state");

    if (!code || !returnedState || !storedState || returnedState !== storedState
    ) {
      return NextResponse.json(
        { message: "Invalid OAuth request" },
        { status: 400 },
      );
    }


    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",

        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new Error("GitHub token exchange failed");
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenData.access_token) {
      throw new Error(
        tokenData.error ?? "GitHub access token missing",
      );
    }

    const accessToken = tokenData.access_token;


    const userResponse = await fetch(
      "https://api.github.com/user",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!userResponse.ok) {
      throw new Error("Failed to fetch GitHub user");
    }

    const githubUser =
      (await userResponse.json()) as GitHubUser;


    const emailResponse = await fetch(
      "https://api.github.com/user/emails",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!emailResponse.ok) {
      throw new Error("Failed to fetch GitHub emails");
    }

    const emails =
      (await emailResponse.json()) as GitHubEmail[];

    const githubEmail =
      emails.find(
        (email) => email.primary && email.verified,
      ) ??
      emails.find((email) => email.verified);

    if (!githubEmail) {
      return NextResponse.json(
        {
          message:
            "A verified GitHub email is required",
        },
        { status: 400 },
      );
    }

    const email = githubEmail.email.toLowerCase();


    let account = await db.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "github",
          providerAccountId: String(githubUser.id),
        },
      },

      include: {
        user: true,
      },
    });

    let user;

    if (account) {
      user = account.user;
    } else {

      const existingUser = await db.user.findUnique({
        where: {
          email,
        },
      });

      if (existingUser) {
       
        return NextResponse.json(
          {
            message:
              "An account already exists with this email. Sign in using your existing method first.",
          },
          { status: 409 },
        );
      }

      user = await db.user.create({
        data: {
          email,
          name: githubUser.name,

          accounts: {
            create: {
              provider: "github",
              providerAccountId: String(githubUser.id),
            },
          },
        },
      });
    }


    const sessionId = await createSession(user.id);


    cookieStore.set("session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });


    return NextResponse.redirect(
      new URL("/workspace", request.url),
    );
  } catch (error) {
    console.error("GitHub OAuth error:", error);

    return NextResponse.redirect(
      new URL("/login?error=github_oauth", request.url),
    );
  }
}