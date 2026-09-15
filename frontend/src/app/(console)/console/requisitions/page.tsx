import { ConsoleShell } from "@/features/console/components/ConsoleShell";
import { RequisitionList } from "@/features/console/requisitions/RequisitionList";

export default function RequisitionsPage() {
  return (
    <ConsoleShell>
      <RequisitionList />
    </ConsoleShell>
  );
}
