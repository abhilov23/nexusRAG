import {NextResponse} from "next/server";
import {db} from "@repo/database";
import {hashPassword} from "@/lib/auth/password";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        const {email, password, name} = body;

        if (!email || !password) {
            return NextResponse.json(
                { message: "Email and password are required" },
                { status: 400 }
            );
        }

        if (typeof email !== "string" || typeof password !== "string") {
            return NextResponse.json(
                { message: "Invalid input" },
                { status: 400 }
            );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { message: "Invalid email format" },
                { status: 400 }
            );
        }

        if (password.length < 8) {
            return NextResponse.json(
                { message: "Password must be at least 8 characters" },
                { status: 400 }
            );
        }

        const existingUser = await db.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingUser) {
            return NextResponse.json(
                { message: "An account with this email already exists" },
                { status: 409 }
            );
        }

        const hashedPassword = await hashPassword(password);

        await db.user.create({
            data: {
                email: email.toLowerCase(),
                passwordHash: hashedPassword,
                name: name || null,
            }
        });

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error("Signup error:", error);
        return NextResponse.json(
            { message: "Internal server error" },
            { status: 500 }
        );
    }
}
