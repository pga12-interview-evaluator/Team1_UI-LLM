"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Card, CardBody, CardHeader, Input } from "@/components/ui";
import { consoleApi } from "@/lib/api/console";
import { ApiError } from "@/lib/api/client";
import { publicEnv } from "@/lib/config/env";
import { useT } from "@/lib/i18n/I18nProvider";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const devAccess =
    process.env.NODE_ENV === "development" && publicEnv.NEXT_PUBLIC_API_MODE === "mock";
  async function enterWorkspace() {
    setDevBusy(true);
    setError(null);
    try {
      await consoleApi.devLogin();
      const next = params.get("next");
      router.replace(
        next && /^\/console(\/[A-Za-z0-9_\-\/]*)?$/.test(next) ? (next as Route) : "/console",
      );
    } catch {
      setError("Couldn’t open the development workspace. Try again.");
    } finally {
      setDevBusy(false);
    }
  }
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await consoleApi.login(values);
      const next = params.get("next");
      // Only same-app console paths are honoured; anything else falls back to the dashboard (open-redirect guard).
      const safeNext =
        next && /^\/console(\/[A-Za-z0-9_\-\/]*)?$/.test(next) ? (next as Route) : "/console";
      router.replace(safeNext);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? t.console.login.failed
          : t.common.errorBody,
      );
    }
  });

  return (
    <main className="page-gradient mx-auto flex min-h-dvh w-full flex-col items-center justify-center px-4">
      <div className="mb-6 flex items-center gap-2">
        <span aria-hidden className="bg-brand inline-block size-6 rounded-md" />
        <span className="text-ink font-semibold">AI Interview</span>
      </div>
      <Card className="animate-scale-in shadow-lift w-full max-w-md">
        <CardHeader title={t.console.login.title} />
        <CardBody>
          {devAccess && (
            <div className="mb-6">
              <p className="text-ink-muted mb-4 text-sm">
                You’re working locally. Open the review workspace without an email or password.
              </p>
              <Button className="w-full" loading={devBusy} onClick={enterWorkspace}>
                Enter development workspace
              </Button>
              <p className="text-ink-muted mt-5 text-center text-xs">
                Or sign in with a test account below
              </p>
              {error && <Alert tone="bad">{error}</Alert>}
            </div>
          )}
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label={t.console.login.email}
              type="email"
              autoComplete="username"
              required
              error={form.formState.errors.email?.message}
              {...form.register("email")}
            />
            <Input
              label={t.console.login.password}
              type="password"
              autoComplete="current-password"
              required
              error={form.formState.errors.password?.message}
              {...form.register("password")}
            />
            {error ? <Alert tone="bad">{error}</Alert> : null}
            <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
              {t.console.login.submit}
            </Button>
            {publicEnv.NEXT_PUBLIC_API_MODE === "mock" ? (
              <p className="text-ink-muted text-xs">
                Mock mode: any work email; password from CONSOLE_DEV_PASSWORD. Prefix the email with
                “reviewer” or “admin” for those roles.
              </p>
            ) : null}
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
