import { Suspense } from "react";
import ChatClient from "./ChatClient";

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center text-[13px] text-[var(--nx-muted)]">
          Loading chat…
        </div>
      }
    >
      <ChatClient />
    </Suspense>
  );
}
