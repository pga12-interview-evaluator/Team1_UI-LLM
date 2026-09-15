import { z } from "zod";
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export function resumeError(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) return "Choose a PDF, DOCX, or TXT resume.";
  if (file.size === 0) return "This file is empty. Choose a different resume.";
  if (file.size > MAX_RESUME_BYTES) return "Your resume must be 10 MB or smaller.";
  return null;
}
export const practiceInputSchema = z.object({
  candidate_name: z.string().trim().min(1).max(100),
  job_title: z.string().trim().min(2).max(150),
  job_description: z.string().trim().max(20000),
  duration_minutes: z.coerce
    .number()
    .pipe(z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)])),
  interview_style: z.enum(["mixed", "technical", "behavioral", "case"]),
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead", "manager"]),
  interview_language: z.enum(["en-IN", "hi-IN"]),
});
export const practiceCreatedSchema = z.object({
  session_id: z.string().min(1),
  invite_token: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  mode: z.enum(["mock", "real"]),
});
