import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleProviders } from "@/features/console/components/ConsoleProviders";

export const metadata: Metadata = { title: "Console" };

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleProviders>{children}</ConsoleProviders>;
}
