import { SimpleInterestCalculator } from "@/components/finance/SimpleInterestCalculator";
import { AppShell } from "@/components/layout/AppShell";

export default function SimpleInterestPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <SimpleInterestCalculator />
      </div>
    </AppShell>
  );
}
