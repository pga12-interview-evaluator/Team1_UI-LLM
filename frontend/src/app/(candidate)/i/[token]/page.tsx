import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InterviewShell } from "@/features/interview/components/InterviewShell";

export const metadata: Metadata = { title: "Interview" };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

export default async function InterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) notFound();
  return <InterviewShell key={token} token={token} />;
}
