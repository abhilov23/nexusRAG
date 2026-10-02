import {redis} from "@repo/redis";
import {randomBytes} from "crypto";

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

export type Session = {
  userId: string;
  createdAt: number;
};

export async function createSession(userId: string): Promise<string> {
   
    const sessionId = randomBytes(16).toString("hex");
    const session : Session = {
     userId,
     createdAt : Date.now(),
    }
    
    await redis.set(
    `session:${sessionId}`,
    JSON.stringify(session),
    "EX",
    SESSION_TTL,
    );

    return sessionId;
}

export async function getSession(sessionId: string): Promise<Session | null> {
    const sessionData = await redis.get(`session:${sessionId}`);

    if (!sessionData) {
        return null;
    }

    return JSON.parse(sessionData) as Session;
}

export async function deleteSession(sessionId: string): Promise<void> {
    await redis.del(`session:${sessionId}`);
}