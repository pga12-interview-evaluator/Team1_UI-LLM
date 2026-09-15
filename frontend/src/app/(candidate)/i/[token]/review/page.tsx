import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PracticeReviewPage } from "@/features/review/PracticeReviewPage";

export const metadata: Metadata = { title: "Your review" };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) notFound();
  return <PracticeReviewPage key={token} token={token} />;
}
