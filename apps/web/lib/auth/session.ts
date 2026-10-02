import {redis} from "@repo/redis";

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

export type Session = {
  userId: string;
  createdAt: number;
};

function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string): Promise<string> {
   
    const sessionId = generateSessionId();
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