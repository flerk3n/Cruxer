import { DashboardShell } from "@/components/dashboard-shell";
import { ToastProvider } from "@/components/toast-provider";

export default function Layout({ children }: { children: React.ReactNode }) { return <ToastProvider><DashboardShell>{children}</DashboardShell></ToastProvider>; }
