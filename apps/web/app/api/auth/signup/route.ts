import {NextResponse} from "next/server";
import {db} from "@repo/database";
import {hashPassword} from "@/lib/auth/password";

export async function POST(request: Request) {
    const body = await request.json();
    
    const {email, password} = body;

    const hashedPassword = await hashPassword(password);    

    db.user.create({
        data: {
           email : email,
           passwordHash : hashedPassword,
        }
    });

    return NextResponse.json({"success" : true});
}
