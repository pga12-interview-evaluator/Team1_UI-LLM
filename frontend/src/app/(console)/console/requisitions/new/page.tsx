import { ConsoleShell, PageHeader } from "@/features/console/components/ConsoleShell";
import { RequisitionForm } from "@/features/console/requisitions/RequisitionForm";

export default function NewRequisitionPage() {
  return (
    <ConsoleShell>
      <PageHeader
        title="New requisition"
        description="Paste the original job description. The planner extracts requirements; it does not invent them."
      />
      <RequisitionForm />
    </ConsoleShell>
  );
}
