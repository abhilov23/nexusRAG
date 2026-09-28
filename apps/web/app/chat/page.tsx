import { Suspense } from "react";
import ChatClient from "./ChatClient";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="chat-layout">Loading...</div>}>
      <ChatClient />
    </Suspense>
  );
}