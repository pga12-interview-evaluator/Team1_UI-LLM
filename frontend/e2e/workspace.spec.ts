import { expect, test } from "@playwright/test";

test("development entry needs no email and stays disabled in production", async ({
  page,
  request,
}) => {
  await page.goto("/console/login");
  const entry = page.getByRole("button", { name: "Enter development workspace" });
  if (await entry.isVisible()) {
    await entry.click();
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  } else {
    const response = await request.post("/api/mock/console/dev-login");
    expect(response.status()).toBe(404);
  }
});

test("workspace is responsive and routes to resume setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Let’s get you interview-ready." })).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Start an interview", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Start an interview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make this interview yours." })).toBeVisible();
  await page.getByLabel("Upload resume").setInputFiles({
    name: "resume.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByText("Choose a PDF, DOCX, or TXT resume.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("resume creates a fresh session; recording saves, plays, and can be downloaded", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/setup");
  await page.getByLabel("Upload resume").setInputFiles({
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Test Candidate\nData analyst with SQL and Python experience."),
  });
  await page.getByLabel("Your name").fill("Studio Test");
  await page.getByLabel("Target role", { exact: true }).fill("Data analyst");
  await page.screenshot({ path: "test-results/setup-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Continue to device setup" }).click();
  await expect(page).toHaveURL(/\/i\/inv_/);
  await page.getByRole("checkbox", { name: /I understand this interview/ }).check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page.getByText("Microphone detected")).toBeVisible();
  await page.getByRole("button", { name: "Everything looks fine — continue" }).click();
  await page.getByRole("button", { name: "Begin the interview" }).click();
  await expect(page.getByRole("button", { name: "Pause recording", exact: true })).toBeVisible();
  await expect(page.getByLabel("Your camera preview")).toBeVisible();
  // Permission denial is recoverable; no false 'Sharing' status.
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      throw new DOMException("Cancelled", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "Share screen", exact: true }).click();
  await expect(page.getByText(/Screen sharing was cancelled or blocked/)).toBeVisible();
  // A synthetic display stream exercises successful preview and compositing without capturing the user's desktop.
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#7350c5";
      ctx.fillRect(0, 0, 640, 360);
      const stream = canvas.captureStream(10);
      const timer = setInterval(() => {
        ctx.fillRect(0, 0, 640, 360);
      }, 100);
      stream.getVideoTracks()[0].addEventListener("ended", () => clearInterval(timer));
      return stream;
    };
  });
  await page.getByRole("button", { name: "Share screen", exact: true }).click();
  await expect(page.getByLabel("Your shared screen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish answer", exact: true }).click();
  await expect(page.getByText(/three quick facts/)).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: "test-results/studio-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Pause recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume recording", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume recording", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download recording", exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download recording", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/interview-.*\.(webm|mp4)$/);
  await page.getByRole("link", { name: "Open recording library" }).click();
  await expect(page.getByRole("heading", { name: "Data analyst", exact: true })).toBeVisible();
  const video = page.getByLabel("Data analyst recording");
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThanOrEqual(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Data analyst", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete recording", exact: true }).click();
  await expect(page.getByText("A place for your practice")).toBeVisible();
  expect(errors).toEqual([]);
});
