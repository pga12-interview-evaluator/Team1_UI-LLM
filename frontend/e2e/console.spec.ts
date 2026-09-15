import { expect, test } from "@playwright/test";

const PASSWORD = process.env.E2E_CONSOLE_PASSWORD ?? "change-me";

test("console is gated and a reviewer can reach the report and record a decision", async ({
  page,
  request,
}) => {
  await page.goto("/console/sessions");
  await expect(page).toHaveURL(/\/console\/login\?next=%2Fconsole%2Fsessions/);

  await page.getByLabel("Work email").fill("reviewer.e2e@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();

  // The API fixture has its own cookie jar: sign it in separately.
  await request.post("/api/mock/console/login", {
    data: { email: "reviewer.e2e@example.com", password: PASSWORD },
  });

  // Drive a session to closure through the API so the report can be generated.
  const invite = await request.post("/api/mock/console/requisitions/REQ_demo_fpa/invites", {
    data: { candidate_label: "Report Candidate" },
  });
  const { invite_token, session_id } = (await invite.json()) as {
    invite_token: string;
    session_id: string;
  };
  const base = `/api/mock/candidate/sessions/${invite_token}`;
  await request.post(`${base}/consent`, {
    data: {
      ai_interview_notice_ack: true,
      recording_consent: false,
      behavioral_analysis_consent: false,
      notice_version: "2026-03",
    },
  });
  await request.post(`${base}/device-ready`, { data: { camera: false, microphone: false } });
  await request.post(`${base}/start`);
  await request.post(`${base}/requests`, { data: { type: "stop" } });

  await page.goto(`/console/sessions/${session_id}`);
  await expect(page.getByRole("button", { name: "Generate report" })).toBeVisible();
  await page.getByRole("button", { name: "Generate report" }).click();
  await page.getByRole("button", { name: "Open report" }).click();

  await expect(page.getByRole("heading", { name: /Report · Report Candidate/ })).toBeVisible();
  await expect(page.getByText("Read the evidence before the label.").first()).toBeVisible();
  await expect(page.getByText("Non-scored behavioral context", { exact: false })).toHaveCount(0); // consent false → block omitted

  await page.getByLabel("Decision").selectOption("hold");
  await page
    .getByLabel("Reason")
    .fill("Stopped before any assessable answer; nothing to decide on yet.");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText(/Recorded .* by/)).toBeVisible();
});

test("new requisition form enforces the intense-pressure rationale", async ({ page }) => {
  await page.goto("/console/login");
  await page.getByLabel("Work email").fill("recruiter.e2e@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
  await page.goto("/console/requisitions/new");

  await page.getByLabel("Job title").fill("Sales Manager");
  await page.getByLabel("Field / domain").fill("B2B SaaS sales");
  await page
    .getByLabel("Job description")
    .fill(
      "Own the mid-market pipeline, coach four account executives, forecast quarterly bookings and run weekly pipeline reviews.",
    );
  await page.getByLabel("Must-have skills").fill("forecasting, pipeline reviews, coaching");
  await page.getByLabel("Pressure level").selectOption("intense");
  await page.getByRole("button", { name: "Create requisition" }).click();
  await expect(page.getByText(/rationale is required for intense pressure/)).toBeVisible();

  await page
    .getByLabel(/rationale for intense pressure/)
    .fill("Real-time objection handling with senior buyers is a daily part of this role.");
  await page.getByRole("button", { name: "Create requisition" }).click();
  await expect(page.getByRole("heading", { name: "Sales Manager" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate blueprint" })).toBeVisible();
});
