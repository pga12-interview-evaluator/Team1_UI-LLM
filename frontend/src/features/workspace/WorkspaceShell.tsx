"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { publicEnv } from "@/lib/config/env";
const nav: {
  href: "/" | "/setup" | "/recordings" | "/review" | "/guide";
  label: string;
  icon: IconName;
}[] = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/setup", label: "Interview studio", icon: "mic" },
  { href: "/recordings", label: "Recordings", icon: "video" },
  { href: "/review", label: "Review & insights", icon: "chart" },
  { href: "/guide", label: "Preparation guide", icon: "book" },
];
export function Brand() {
  return (
    <span className="brand-lockup">
      <span className="brand-symbol">
        <Icon name="spark" size={23} />
      </span>
      <span>
        interview<span className="brand-word">ly</span>
        <span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export function WorkspaceShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  return (
    <div className="workspace">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      <aside className="workspace-sidebar">
        <Link href="/" aria-label="Interviewly home" className="sidebar-brand">
          <Brand />
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">Y</span>
          <span>
            Your workspace<small>Interview practice</small>
          </span>
          <Icon name="settings" size={16} />
        </div>
        <p className="sidebar-caption">Workspace</p>
        <nav aria-label="Workspace">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname === item.href ? "active" : ""}`}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.href === "/setup" && <span className="nav-new">AI</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="spark" size={25} />
            <h3>
              A little practice.
              <br />A lot more confidence.
            </h3>
            <p>Your next opportunity starts with a conversation.</p>
            <Link href="/setup">
              Let’s get you ready <Icon name="arrow" size={16} />
            </Link>
          </div>
          <Link href="/guide" className="sidebar-link">
            <Icon name="help" /> Help & getting started
          </Link>
          <div className="sidebar-profile">
            <span className="profile-avatar">Y</span>
            <span>
              Your learning space<small>No email needed to practice</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div>
            <span className="breadcrumb">
              Workspace <span>/</span>
            </span>{" "}
            <strong>{title}</strong>
          </div>
          <div className="header-right">
            <span className="environment-pill">
              <span />
              {publicEnv.NEXT_PUBLIC_API_MODE === "mock" ? "Demo workspace" : "Connected workspace"}
            </span>
            <span className="profile-avatar">Y</span>
          </div>
        </header>
        <nav className="mobile-workspace-nav" aria-label="Workspace mobile">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </Link>
          ))}
        </nav>
        <main id="workspace-content" className="workspace-content">
          <div className="workspace-page-heading">
            <div>
              <p className="section-kicker">Your interview workspace</p>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Made for your next chapter.</span>
          <span>
            <Icon name="shield" size={14} /> You control your camera and recordings
          </span>
        </footer>
      </div>
    </div>
  );
}
