import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FlaskConical, MessageCircle, ShieldAlert } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getMessengerConnection } from "@/lib/data/queries";
import { env, isGeminiConfigured, isMessengerWebhookConfigured, isServiceRoleConfigured } from "@/lib/env";
import { Alert, Card, CardHeader, PageHeader, StatusBadge, buttonStyles } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { ConnectMessengerForm, MessengerModeActions } from "./messenger-form";

export const metadata: Metadata = { title: "Messenger Integration" };

export default async function MessengerPage() {
  const ctx = await getAppContext();
  const conn = await getMessengerConnection(ctx);
  const status = conn?.status ?? "disconnected";
  const canManage = ctx.mode === "live" && (ctx.role === "owner" || ctx.role === "admin");
  const webhookUrl = `${env.appUrl}/api/messenger/webhook`;
  const webhookReady = isMessengerWebhookConfigured() && isServiceRoleConfigured();
  const geminiReady = isGeminiConfigured();

  return (
    <>
      <PageHeader
        title="Facebook Messenger Integration"
        description="Connect your Facebook Page so customers can book appointments right in Messenger."
        action={<MessengerModeActions status={status} canManage={canManage} />}
      />

      <div className="space-y-6">
        {status === "mock" && (
          <Alert tone="warning" title="Mock mode is active">
            No real Messenger messages are sent or received. Use the{" "}
            <Link href="/dashboard/conversations" className="font-medium underline">
              Conversations simulator
            </Link>{" "}
            to test your Gemini AI booking assistant safely.
          </Alert>
        )}
        {status === "error" && conn?.last_error && (
          <Alert tone="error" title="Connection error">
            {conn.last_error}
          </Alert>
        )}
        {status === "disconnected" && (
          <Alert tone="info" title="Facebook Messenger is not connected">
            Link your Facebook Page below to reply to Messenger customers automatically, or enable Mock Mode to test in the simulator.
          </Alert>
        )}

        <Card>
          <CardHeader title="Connection status" action={<StatusBadge status={status} />} />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mode</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                {status === "connected" ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-600" /> Facebook Messenger (Live)
                  </>
                ) : status === "mock" ? (
                  <>
                    <FlaskConical className="size-4 text-amber-600" /> Mock Sandbox
                  </>
                ) : (
                  <>
                    <MessageCircle className="size-4 text-slate-400" /> Disconnected
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Facebook Page</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{conn?.page_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Page ID</p>
              <p className="mt-1 font-mono text-xs text-slate-700">{conn?.page_id ?? "—"}</p>
              {conn?.last_verified_at && (
                <p className="mt-0.5 text-xs text-slate-500">Verified {formatDateTime(conn.last_verified_at, ctx.business.timezone)}</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Server configuration checklist" description="Environment variables checked on the server." />
          <ul className="divide-y divide-slate-100 text-sm">
            <li className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-medium text-slate-900">Webhook signature & verify token</p>
                <p className="text-xs text-slate-500">Requires MESSENGER_VERIFY_TOKEN and MESSENGER_APP_SECRET</p>
              </div>
              <StatusBadge status={webhookReady ? "connected" : "disconnected"} />
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-medium text-slate-900">Gemini AI assistant</p>
                <p className="text-xs text-slate-500">Requires GEMINI_API_KEY ({env.geminiModel})</p>
              </div>
              <StatusBadge status={geminiReady ? "connected" : "disconnected"} />
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Connect your Facebook Page"
            description="Paste your Page ID and Page Access Token from Meta Developers. BookAI verifies them with Facebook Graph API before saving."
          />
          <div className="p-5">
            {ctx.mode === "demo" ? (
              <Alert tone="warning">Connect Supabase to configure a Messenger connection.</Alert>
            ) : !canManage ? (
              <Alert tone="info" title="Admin access required">
                <span className="inline-flex items-center gap-1">
                  <ShieldAlert className="size-4" /> Only business owners and admins can change Messenger credentials.
                </span>
              </Alert>
            ) : (
              <ConnectMessengerForm connection={conn} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Meta Messenger Webhook setup" description="Paste these values in Meta for Developers → Messenger → Messenger API Settings → Webhooks." />
          <div className="space-y-4 p-5 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Callback URL</p>
              <code className="mt-1 block overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
                {webhookUrl}
              </code>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Verify Token & Webhook Fields</p>
              <p className="mt-1 text-slate-600">
                Use the exact value of <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">MESSENGER_VERIFY_TOKEN</code>, then subscribe your Page to the{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">messages</code> (and optionally{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">message_deliveries</code>) webhook fields.
              </p>
            </div>
            <div>
              <Link href="/dashboard/conversations" className={buttonStyles("secondary", "sm")}>
                Open Conversations & AI Simulator
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
