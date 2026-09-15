import type { Metadata } from "next";
import { ReviewLibrary } from "@/features/review/ReviewLibrary";

export const metadata: Metadata = { title: "Review & insights" };

export default function ReviewLibraryPage() {
  return <ReviewLibrary />;
}
