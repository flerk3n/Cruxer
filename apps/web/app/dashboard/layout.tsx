import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardAuthGate } from "@/components/dashboard-auth-gate";
import { ToastProvider } from "@/components/toast-provider";

export default function Layout({ children }: { children: React.ReactNode }) { return <ToastProvider><DashboardAuthGate><DashboardShell>{children}</DashboardShell></DashboardAuthGate></ToastProvider>; }
