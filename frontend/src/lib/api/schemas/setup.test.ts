import { describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES, practiceInputSchema, resumeError } from "./setup";
describe("resume boundary", () => {
  it("accepts supported files at the size limit", () => {
    for (const name of ["CV.PDF", "resume.docx", "resume.txt"])
      expect(resumeError({ name, size: MAX_RESUME_BYTES })).toBeNull();
  });
  it("rejects empty, oversized, and unsupported files", () => {
    for (const file of [
      { name: "resume.pdf", size: 0 },
      { name: "resume.pdf", size: MAX_RESUME_BYTES + 1 },
      { name: "resume.pdf.exe", size: 8 },
    ])
      expect(resumeError(file)).not.toBeNull();
  });
  it("rejects arbitrary duration and blank names before upload", () => {
    const valid = {
      candidate_name: "  Sam  ",
      job_title: "Analyst",
      job_description: "",
      duration_minutes: "30",
      interview_style: "mixed",
      seniority: "junior",
      interview_language: "en-IN",
    };
    expect(practiceInputSchema.parse(valid).candidate_name).toBe("Sam");
    expect(practiceInputSchema.safeParse({ ...valid, duration_minutes: "1000" }).success).toBe(
      false,
    );
    expect(practiceInputSchema.safeParse({ ...valid, candidate_name: " " }).success).toBe(false);
  });
});
