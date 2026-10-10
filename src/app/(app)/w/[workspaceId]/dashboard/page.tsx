import type { Metadata } from "next";
import { CashflowDashboard } from "@/features/cashflow/ui/cashflow-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <CashflowDashboard />;
}
