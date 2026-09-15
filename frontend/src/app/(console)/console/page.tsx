import { ConsoleShell } from "@/features/console/components/ConsoleShell";
import { Dashboard } from "@/features/console/components/Dashboard";

export default function ConsoleHome() {
  return (
    <ConsoleShell>
      <Dashboard />
    </ConsoleShell>
  );
}
