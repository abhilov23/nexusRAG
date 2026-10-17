import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/app/context/ThemeContext";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NexusRAG — Codebase Intelligence, In Context",
  description:
    "Understand how your software really works. Ask questions across your repositories and get clear answers grounded in the source.",
  keywords: ["codebase", "AI", "RAG", "search", "chat", "documentation", "developer tools"],
};

// Applies the stored theme before first paint so there is no flash and no
// hydration mismatch. Mirrors the logic in ThemeContext.
const themeInitScript = `(function(){try{var s=localStorage.getItem("nexus-theme");var t=(s==="light"||s==="dark"||s==="system")?s:"dark";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(r);e.setAttribute("data-theme",r);e.style.colorScheme=r;}catch(_){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Applies the stored theme before first paint so there is no flash.

          React warns about `<script>` inside a component because scripts added
          during a client render do not execute. In the App Router this one is
          server-rendered into the initial HTML, so it does run -- and it has to
          be here rather than in a useEffect, which would run too late and cause
          a visible flash. The warning is a false positive for this case.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
