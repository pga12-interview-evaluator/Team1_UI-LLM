import "server-only";

/**
 * Resume ingestion: extract text from PDF / DOCX / TXT and apply the redaction pass required by
 * 00 §3 (`resume_redaction_applied` must be true): contact details, DOB/age, gender, marital
 * status, religion, caste, nationality, full addresses and photo references are removed.
 */
export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(bytes);
    return parsed.text;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value;
  }
  return bytes.toString("utf8");
}

const REDACTIONS: [RegExp, string][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]"],
  [/(\+?\d[\d\s().-]{8,}\d)/g, "[phone removed]"],
  [
    /https?:\/\/[^\s)]+|www\.[^\s)]+|linkedin\.com\/[^\s)]+|github\.com\/[^\s)]+/gi,
    "[link removed]",
  ],
  [/\b(?:date of birth|dob|d\.o\.b\.|born)\b[^\n]*/gi, "[date of birth removed]"],
  [/\bage\s*[:\-]?\s*\d{1,2}\b/gi, "[age removed]"],
  [/\b(?:gender|sex)\s*[:\-]?\s*(?:male|female|m|f|other|non-binary)\b/gi, "[gender removed]"],
  [
    /\b(?:marital status|married|unmarried|single|divorced|widowed)\b[^\n]*/gi,
    "[marital status removed]",
  ],
  [
    /\b(?:religion|caste|community|nationality|citizenship)\s*[:\-][^\n]*/gi,
    "[personal detail removed]",
  ],
  [
    /\b(?:father'?s?|mother'?s?|husband'?s?|wife'?s?)\s+name\s*[:\-][^\n]*/gi,
    "[family detail removed]",
  ],
  [/\b(?:address|permanent address|current address)\s*[:\-][^\n]*/gi, "[address removed]"],
  [/\b\d{6}\b/g, "[pin removed]"],
  [
    /\b(?:passport|aadhaar|aadhar|pan)\s*(?:no\.?|number)?\s*[:\-]?\s*[A-Z0-9]{6,}\b/gi,
    "[id removed]",
  ],
  [/\bphoto(?:graph)?\b[^\n]*/gi, "[photo removed]"],
];

export function redactResume(text: string): string {
  let out = text.replace(/\r/g, "").replace(/\t/g, " ");
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  out = out
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out.slice(0, 20_000);
}
