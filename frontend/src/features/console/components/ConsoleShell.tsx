"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { consoleApi } from "@/lib/api/console";
import { useT } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils/cn";
import { Brand } from "@/features/workspace/WorkspaceShell";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useMe } from "../queries";

const NAV = [
  { href: "/console", key: "dashboard" },
  { href: "/console/requisitions", key: "requisitions" },
  { href: "/console/sessions", key: "sessions" },
  { href: "/console/audit", key: "audit" },
] as const;

export function ConsoleShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();

  const logout = async () => {
    await consoleApi.logout();
    router.replace("/console/login");
  };

  return (
    <div className="bg-bg flex min-h-dvh">
      <a
        href="#console-main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        {t.common.skipToContent}
      </a>
      <aside className="console-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col md:flex">
        <div className="border-line border-b px-5 py-4">
          <Link href="/" aria-label="Interviewly home">
            <Brand />
          </Link>
          <p className="text-ink-muted truncate text-xs">
            {me.data ? `${me.data.display_name} · ${me.data.role}` : " "}
          </p>
        </div>
        <nav aria-label="Console" className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active =
              item.href === "/console" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("sidebar-link", active ? "active" : "")}
              >
                <Icon
                  name={
                    (
                      {
                        dashboard: "grid",
                        requisitions: "file",
                        sessions: "mic",
                        audit: "shield",
                      } as Record<string, IconName>
                    )[item.key]
                  }
                />
                {t.console.nav[item.key]}
              </Link>
            );
          })}
        </nav>
        <div className="border-line border-t p-3">
          <Link href="/" className="sidebar-link">
            <Icon name="arrow" />
            Practice workspace
          </Link>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start">
            {t.console.nav.logout}
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-line bg-surface flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <p className="text-sm font-semibold">{t.console.title}</p>
          <nav aria-label="Console" className="ml-auto flex gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink hover:bg-surface-2 rounded-md px-2 py-1 text-xs"
              >
                {t.console.nav[item.key]}
              </Link>
            ))}
          </nav>
        </header>
        <main
          id="console-main"
          className="animate-fade-up mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-ink text-2xl font-semibold">{title}</h1>
        {description ? <p className="text-ink-muted mt-1 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
