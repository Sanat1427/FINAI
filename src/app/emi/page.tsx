import { EMICalculator } from "@/components/finance/EMICalculator";
import { AppShell } from "@/components/layout/AppShell";

export default function EMIPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <EMICalculator />
      </div>
    </AppShell>
  );
}
