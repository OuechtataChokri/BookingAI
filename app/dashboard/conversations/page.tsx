import type { Metadata } from "next";
import Link from "next/link";
import { Bot, MessagesSquare, User } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getConversations, getMessages } from "@/lib/data/queries";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn, formatPhone, formatTime, timeAgo } from "@/lib/utils";
import { ConversationControls, ReplyForm, SimulatorModal } from "./conversation-panel";

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c: selectedParam } = await searchParams;
  const ctx = await getAppContext();
  const conversations = await getConversations(ctx);
  const active = conversations.find((c) => c.id === selectedParam) ?? conversations[0] ?? null;
  const messages = active ? await getMessages(ctx, active.id) : [];

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Facebook Messenger chats handled by Gemini AI or your team."
        action={ctx.mode === "live" ? <SimulatorModal defaultPhone={active?.wa_contact} /> : undefined}
      />

      {conversations.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="When customers message your Facebook Page (or when you send a test message), conversations appear here."
            action={ctx.mode === "live" ? <SimulatorModal /> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Conversation list */}
          <Card className="overflow-hidden lg:col-span-4">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Threads ({conversations.length})</p>
            </div>
            <ul className="max-h-[38rem] divide-y divide-slate-100 overflow-y-auto">
              {conversations.map((conv) => {
                const isSelected = active?.id === conv.id;
                return (
                  <li key={conv.id}>
                    <Link
                      href={`/dashboard/conversations?c=${conv.id}`}
                      className={cn("flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50", isSelected && "bg-brand-50/70")}
                    >
                      <Avatar name={conv.customer?.name ?? conv.wa_contact} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">{conv.customer?.name ?? formatPhone(conv.wa_contact)}</p>
                          <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(conv.last_message_at)}</span>
                        </div>
                        <p className="bidi mt-0.5 truncate text-xs text-slate-500">{conv.last_message_preview ?? "No messages"}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Badge tone={conv.status === "human" ? "amber" : conv.status === "closed" ? "gray" : "violet"}>
                            {conv.status === "human" ? "Human" : conv.status === "closed" ? "Closed" : "AI"}
                          </Badge>
                          {conv.needs_human && <Badge tone="red">Needs reply</Badge>}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Active thread */}
          <Card className="flex flex-col overflow-hidden lg:col-span-8">
            {active ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={active.customer?.name ?? active.wa_contact} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{active.customer?.name ?? "Unnamed customer"}</p>
                      <p className="text-xs text-slate-500">
                        {active.customer?.phone ? formatPhone(active.customer.phone) : `Messenger ID · ${active.wa_contact}`}
                      </p>
                    </div>
                  </div>
                  <ConversationControls conversationId={active.id} status={active.status} />
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-5" style={{ maxHeight: "30rem", minHeight: "18rem" }}>
                  {messages.map((m) => {
                    const outbound = m.direction === "outbound";
                    return (
                      <div key={m.id} className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
                        <div
                          className={cn(
                            "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                            m.sender === "system"
                              ? "border border-red-200 bg-red-50 text-red-900"
                              : outbound
                                ? "bg-brand-600 text-white"
                                : "border border-slate-200 bg-white text-slate-900",
                          )}
                        >
                          <p className="bidi whitespace-pre-wrap">{m.body}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            {m.sender === "ai" ? <Bot className="size-3" /> : <User className="size-3" />}
                            {m.sender}
                          </span>
                          <span>·</span>
                          <span>{formatTime(m.created_at, ctx.business.timezone)}</span>
                          {outbound && (
                            <>
                              <span>·</span>
                              <span className={cn(m.status === "failed" && "text-red-600", m.status === "mock" && "text-amber-600")}>
                                {m.status}
                              </span>
                            </>
                          )}
                          {m.ai_input_tokens !== null && m.ai_output_tokens !== null && (
                            <>
                              <span>·</span>
                              <span>{m.ai_input_tokens + m.ai_output_tokens} tok</span>
                            </>
                          )}
                        </div>
                        {m.error && <p className="mt-0.5 text-xs text-red-600">{m.error}</p>}
                      </div>
                    );
                  })}
                </div>

                <ReplyForm conversationId={active.id} disabled={ctx.mode === "demo"} />
              </>
            ) : null}
          </Card>
        </div>
      )}
    </>
  );
}
