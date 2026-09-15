import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { redactResume } = await import("./resume");

describe("redactResume", () => {
  it("removes contact details and protected attributes but keeps work content", () => {
    const text = `Chaitanya Rana
Email: someone@example.com | Phone: +91 98765 43210 | DOB: 12/03/2002 | Gender: Male | Marital status: single
Address: 12 MG Road, Pune 411001
Led monthly variance analysis and reduced close reporting time by 30%.
LinkedIn: linkedin.com/in/someone`;
    const out = redactResume(text);
    expect(out).not.toMatch(/example\.com|98765|12\/03\/2002|Male|single|MG Road|linkedin/);
    expect(out).toMatch(/reduced close reporting time by 30%/);
    expect(out).toMatch(/\[email removed\]/);
  });

  it("caps length at 20k characters", () => {
    expect(redactResume("x".repeat(30_000)).length).toBeLessThanOrEqual(20_000);
  });
});
