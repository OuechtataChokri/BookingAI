import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getBusinessHours, getTeam } from "@/lib/data/queries";
import { Alert, Card, CardHeader, PageHeader, buttonStyles } from "@/components/ui";
import { BusinessHoursForm, BusinessSettingsForm, TeamSection } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await getAppContext();
  const [hours, team] = await Promise.all([getBusinessHours(ctx), getTeam(ctx)]);
  const canEdit = ctx.mode === "live" && (ctx.role === "owner" || ctx.role === "admin");

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your business profile, opening hours, AI rules and team."
        action={
          ctx.mode === "live" ? (
            <Link href="/onboarding" className={buttonStyles("secondary")}>
              <Plus className="size-4" aria-hidden /> New business
            </Link>
          ) : undefined
        }
      />

      {ctx.mode === "live" && !canEdit && (
        <div className="mb-6">
          <Alert tone="info">You are signed in with the &ldquo;staff&rdquo; role. Only owners and admins can change business settings.</Alert>
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader title="Business profile & AI assistant" description="Timezone, currency, booking rules and assistant behavior." />
          <div className="p-5">
            <BusinessSettingsForm business={ctx.business} disabled={!canEdit} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Opening hours" description={`Local times in ${ctx.business.timezone}.`} />
          <div className="p-5">
            <BusinessHoursForm hours={hours} disabled={!canEdit} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Team" description="People who can access this business dashboard." />
          <div className="p-5">
            <TeamSection
              members={team.members}
              invitations={team.invitations}
              currentUserId={ctx.mode === "live" ? ctx.user.id : null}
              canManage={canEdit}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
