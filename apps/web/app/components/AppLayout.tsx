"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { CommandPalette } from "@/components/app/CommandPalette";
import { useCurrentUser } from "@/app/hooks/useCurrentUser";
import { useTheme } from "@/app/context/ThemeContext";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, status } = useCurrentUser();
  const { resolvedTheme } = useTheme();

  const isAuthPage = pathname === "/login" || pathname === "/reset-password";

  // A stale session cookie passes the middleware (presence check only) but
  // fails /api/auth/me. Bounce to login instead of rendering a dead "Guest"
  // shell with empty data.
  useEffect(() => {
    if (!isAuthPage && status === "anonymous") {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthPage, status, pathname, router]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div
      className={`nx-grain min-h-screen bg-[var(--nx-bg)] text-[var(--nx-ink)] ${
        resolvedTheme === "light" ? "light-app" : ""
      }`}
    >
      <div className="flex min-h-screen w-full items-stretch">
        <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} pathname={pathname} onMenu={() => setSidebarOpen(true)} />
          <main className="main-content min-w-0 flex-1">
            <div className="w-full">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
