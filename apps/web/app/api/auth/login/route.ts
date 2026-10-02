import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {db} from "@repo/database";

import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";


export async function POST(req: Request){

    try {
     const body = await req.json();
     const {email, password} = body;
     
     if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json(
        { message: "Email and password are required" },
        { status: 400 },
      );
    }
   
    const user = await db.user.findUnique({
        where: {
            email: email,
        }
    });
    
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }
   
     const passwordValid = await verifyPassword( user.passwordHash, password );

    if (!passwordValid) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }
    
    const sessionId = await createSession(user.id);

    const cookieStore = await cookies();

    cookieStore.set("session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        }},
      { 
        status: 200
      },
    );
    
}
catch(error){
    console.error("Login error:", error);

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
    }
}