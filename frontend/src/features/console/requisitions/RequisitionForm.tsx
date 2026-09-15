"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  requisitionBaseSchema,
  requisitionInputSchema,
  type Requisition,
  type RequisitionInput,
} from "@/lib/api/schemas/console";
import { useCreateRequisition, useUpdateRequisition } from "../queries";

/** Form values keep skills as comma-separated strings; the submit maps them to the contract arrays. */
const formSchema = requisitionBaseSchema
  .omit({ must_have_skills: true, nice_to_have_skills: true })
  .extend({
    must_have_skills_text: z.string().min(1, "At least one must-have skill."),
    nice_to_have_skills_text: z.string(),
  });
type FormValues = z.infer<typeof formSchema>;

const splitSkills = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

function toInput(values: FormValues): RequisitionInput {
  const { must_have_skills_text, nice_to_have_skills_text, ...rest } = values;
  return {
    ...rest,
    field_family: rest.field_family || null,
    employment_type: rest.employment_type || null,
    location_or_market: rest.location_or_market || null,
    pressure_rationale: rest.pressure_rationale || null,
    company_context: rest.company_context || null,
    interviewer_constraints: rest.interviewer_constraints || null,
    must_have_skills: splitSkills(must_have_skills_text),
    nice_to_have_skills: splitSkills(nice_to_have_skills_text),
  };
}

const option = (value: string, label = value.replace(/_/g, " ")) => ({ value, label });

export function RequisitionForm({ existing }: { existing?: Requisition }) {
  const router = useRouter();
  const create = useCreateRequisition();
  const update = useUpdateRequisition(existing?.requisition_id ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          ...existing,
          must_have_skills_text: existing.must_have_skills.join(", "),
          nice_to_have_skills_text: existing.nice_to_have_skills.join(", "),
        }
      : {
          job_title: "",
          field: "",
          field_family: null,
          seniority: "mid",
          employment_type: "full_time",
          location_or_market: "",
          interview_language: "en-IN",
          duration_minutes: 45,
          interview_style: "mixed",
          interview_modality: "both",
          interview_purpose: "hiring",
          pressure_level: "standard",
          pressure_rationale: "",
          job_description: "",
          must_have_skills_text: "",
          nice_to_have_skills_text: "",
          company_context: "",
          interviewer_constraints: "",
        },
  });
  const pressure = form.watch("pressure_level");

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const input = toInput(values);
    const contract = requisitionInputSchema.safeParse(input);
    if (!contract.success) {
      const issue = contract.error.issues[0];
      if (issue?.path[0] === "pressure_rationale")
        form.setError("pressure_rationale", { message: issue.message });
      else setServerError(issue?.message ?? "Invalid input.");
      return;
    }
    try {
      const saved = existing
        ? await update.mutateAsync(contract.data)
        : await create.mutateAsync(contract.data);
      router.push(`/console/requisitions/${saved.requisition_id}`);
    } catch (caught) {
      setServerError(
        caught instanceof ApiError ? caught.message : "Could not save the requisition.",
      );
    }
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Role"
          description="Keep the original job description text. The planner labels inferences; it never invents requirements."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Job title"
            required
            error={errors.job_title?.message}
            {...form.register("job_title")}
          />
          <Input
            label="Field / domain"
            required
            error={errors.field?.message}
            {...form.register("field")}
          />
          <Controller
            control={form.control}
            name="field_family"
            render={({ field }) => (
              <Select
                label="Field family"
                hint="Leave blank to let the planner infer it."
                options={[
                  option("", "Infer"),
                  ...[
                    "software",
                    "data_analytics_ds",
                    "finance_accounting",
                    "sales_marketing",
                    "operations_supply",
                    "people_hr",
                    "general_business",
                  ].map((v) => option(v)),
                ]}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            )}
          />
          <Select
            label="Seniority"
            required
            options={["intern", "junior", "mid", "senior", "lead", "manager"].map((v) => option(v))}
            {...form.register("seniority")}
          />
          <Input label="Employment type" {...form.register("employment_type")} />
          <Input
            label="Location or market"
            hint="Only if job-relevant."
            {...form.register("location_or_market")}
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Job description"
              required
              rows={8}
              hint="Verbatim. Minimum 50 characters."
              error={errors.job_description?.message}
              {...form.register("job_description")}
            />
          </div>
          <Textarea
            label="Must-have skills"
            required
            hint="Comma-separated. These become critical competencies."
            error={errors.must_have_skills_text?.message}
            {...form.register("must_have_skills_text")}
          />
          <Textarea
            label="Nice-to-have skills"
            hint="Comma-separated."
            {...form.register("nice_to_have_skills_text")}
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Company context"
              hint="The only source the interviewer may use to answer candidate questions."
              {...form.register("company_context")}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Interviewer constraints"
              hint="e.g. no coding task; candidate may use paper."
              {...form.register("interviewer_constraints")}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Interview settings"
          description="Pressure level is a property of the requisition — identical for every candidate. It changes how many follow-ups and how fast, never tone or rubric."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Interview purpose"
            options={[option("hiring"), option("mock_practice")]}
            {...form.register("interview_purpose")}
          />
          <Select
            label="Pressure level"
            options={[option("calm"), option("standard"), option("intense")]}
            {...form.register("pressure_level")}
          />
          {pressure === "intense" ? (
            <div className="sm:col-span-2">
              <Textarea
                label="Job-relatedness rationale for intense pressure"
                required
                hint="Required and logged. Explain why real-time challenge is part of this job."
                error={errors.pressure_rationale?.message}
                {...form.register("pressure_rationale")}
              />
            </div>
          ) : null}
          <Select
            label="Interview style"
            options={["technical", "case", "behavioral", "mixed"].map((v) => option(v))}
            {...form.register("interview_style")}
          />
          <Select
            label="Modality"
            options={["voice", "text", "both"].map((v) => option(v))}
            {...form.register("interview_modality")}
          />
          <Input
            label="Interview language (BCP-47)"
            required
            hint="e.g. en-IN, hi-IN"
            error={errors.interview_language?.message}
            {...form.register("interview_language")}
          />
          <Input
            label="Duration (minutes)"
            type="number"
            min={20}
            max={90}
            required
            error={errors.duration_minutes?.message}
            {...form.register("duration_minutes", { valueAsNumber: true })}
          />
        </CardBody>
      </Card>

      {serverError ? <Alert tone="bad">{serverError}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {existing ? "Save changes" : "Create requisition"}
        </Button>
      </div>
    </form>
  );
}
