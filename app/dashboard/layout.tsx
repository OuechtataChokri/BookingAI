import { getAppContext } from "@/lib/auth/context";
import { DashboardShell } from "@/components/dashboard/shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  return (
    <DashboardShell
      businessName={ctx.business.name}
      businesses={ctx.mode === "live" ? ctx.memberships : [{ business_id: ctx.business.id, name: ctx.business.name }]}
      activeBusinessId={ctx.business.id}
      userEmail={ctx.mode === "live" ? (ctx.user.email ?? null) : null}
      demo={ctx.mode === "demo"}
    >
      {children}
    </DashboardShell>
  );
}
