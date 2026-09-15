"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  humanDecisionInputSchema,
  type HumanDecision,
  type HumanDecisionInput,
} from "@/lib/api/schemas/console";
import { track } from "@/lib/telemetry/track";
import { formatDateTime } from "@/lib/utils/time";
import { useRecordDecision } from "../queries";

const DECISIONS = [
  { value: "advance", label: "Advance to next stage" },
  { value: "additional_evaluation", label: "Additional evaluation (work sample / follow-up)" },
  { value: "hold", label: "Hold" },
  { value: "decline", label: "Decline" },
  { value: "no_decision", label: "No decision yet" },
];

/** The human decision is recorded separately from the model's label and is what actually counts. */
export function DecisionForm({
  sessionId,
  existing,
}: {
  sessionId: string;
  existing: HumanDecision | null;
}) {
  const record = useRecordDecision(sessionId);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const form = useForm<HumanDecisionInput>({
    resolver: zodResolver(humanDecisionInputSchema),
    defaultValues: existing
      ? { decision: existing.decision, reason: existing.reason }
      : { decision: "no_decision", reason: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await record.mutateAsync(values);
      track({ name: "console.decision_recorded", decision: values.decision });
      toast.push({
        tone: "ok",
        title: "Decision recorded",
        body: "Stored with the report and the audit log.",
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not record the decision.");
    }
  });

  return (
    <Card>
      <CardHeader
        title="Human decision"
        description={
          existing
            ? `Recorded ${formatDateTime(existing.recorded_at)} by ${existing.reviewer_id}`
            : "Required. Your reason is stored with the report."
        }
      />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Select
            label="Decision"
            required
            options={DECISIONS}
            error={form.formState.errors.decision?.message}
            {...form.register("decision")}
          />
          <Textarea
            label="Reason"
            required
            hint="Cite the evidence you relied on (question ids, quotes). Minimum 10 characters."
            error={form.formState.errors.reason?.message}
            {...form.register("reason")}
          />
          {error ? <Alert tone="bad">{error}</Alert> : null}
          <Button type="submit" loading={form.formState.isSubmitting}>
            {existing ? "Update decision" : "Record decision"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
