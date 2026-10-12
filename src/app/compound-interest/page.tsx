import { CompoundInterestCalculator } from "@/components/finance/CompoundInterestCalculator";
import { AppShell } from "@/components/layout/AppShell";

export default function CompoundInterestPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <CompoundInterestCalculator />
      </div>
    </AppShell>
  );
}
