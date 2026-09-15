import { expect, test } from "@playwright/test";

const PASSWORD = process.env.E2E_CONSOLE_PASSWORD ?? "change-me";

/**
 * Candidate journey against the in-app mock API: consent → device check (typed answers) →
 * disclosure → anchors → main question → bluff → OWN probe → break/resume → stop → escalation.
 */
test("candidate can complete the trap chain and stop safely", async ({ page, request }) => {
  // A fresh invite per run so the demo session is not consumed.
  const login = await request.post("/api/mock/console/login", {
    data: { email: "e2e@example.com", password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const invite = await request.post("/api/mock/console/requisitions/REQ_demo_fpa/invites", {
    data: { candidate_label: "E2E Candidate" },
  });
  expect(invite.ok()).toBeTruthy();
  const { invite_token } = (await invite.json()) as { invite_token: string };

  await page.goto(`/i/${invite_token}`);
  await expect(page.getByRole("heading", { name: "Before you begin" })).toBeVisible();
  await page.getByRole("checkbox", { name: /I understand this interview/ }).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();

  await expect(page.getByRole("heading", { name: "Check your setup" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with typed answers only" }).click();

  await expect(page.getByRole("heading", { name: "How this interview works" })).toBeVisible();
  await expect(page.getByText(/conducted by an AI interviewer/)).toBeVisible();
  await page.getByRole("button", { name: "Begin the interview" }).click();

  const answer = page.getByRole("textbox", { name: "Your answer" });
  const submit = page.getByRole("button", { name: "Submit answer" });

  await expect(page.getByText(/what does your current role involve/)).toBeVisible();
  await answer.fill(
    "I run monthly variance analysis for three plants and own the day-five close pack.",
  );
  await submit.click();

  await expect(page.getByText(/three quick facts/)).toBeVisible({ timeout: 10_000 });
  await answer.fill(
    "Analyst on the close; three plant controllers and a GL accountant; about four months.",
  );
  await submit.click();

  await expect(page.getByText(/reducing close reporting time by 30%/)).toBeVisible({
    timeout: 10_000,
  });
  await answer.fill(
    "We brought the month-end close from nine days to five by automating the reconciliations. It was a big team effort and leadership was very happy with the 30% improvement.",
  );
  await submit.click();

  // The trap: collective + unanchored metric → OWN probe with the permission opener.
  await expect(page.getByText("It is fine to say I here.", { exact: false })).toBeVisible({
    timeout: 10_000,
  });

  // Rights: break then resume repeats the pending probe verbatim.
  await page.getByRole("button", { name: /Take a break/ }).click();
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "I am ready to continue" }).click();
  await expect(page.getByText("It is fine to say I here.", { exact: false })).toBeVisible();

  // No praise, ever.
  await expect(page.locator("main")).not.toContainText(/great|excellent|interesting|impressive/i);

  // Stop → confirmation → escalation script.
  await page.getByRole("button", { name: /^Stop\./ }).click();
  await page.getByRole("button", { name: "Yes, end the interview" }).click();
  await expect(page.getByRole("heading", { name: "Interview paused" })).toBeVisible();
  await expect(page.getByText(/a member of the team will follow up/)).toBeVisible();
});

test("invalid invite link shows a clear message", async ({ page }) => {
  await page.goto("/i/does-not-exist");
  await expect(page.getByText(/not valid or has expired/)).toBeVisible();
});
