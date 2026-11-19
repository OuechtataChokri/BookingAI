"use client";

import { useState } from "react";
import { Check, Copy, Trash2, UserPlus } from "lucide-react";
import { ActionForm, ConfirmActionButton, SubmitButton, fieldError } from "@/components/forms";
import { Alert, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction, updateBusinessAction, updateHoursAction } from "@/lib/actions/business";
import { BUSINESS_TYPES, CURRENCIES, DAY_NAMES, LANGUAGES, TIMEZONES } from "@/lib/utils";
import type { ActionResult, Business, BusinessHours, Invitation, Member } from "@/lib/types";

export function BusinessSettingsForm({ business, disabled }: { business: Business; disabled?: boolean }) {
  return (
    <ActionForm action={updateBusinessAction} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" htmlFor="name" error={fieldError(fieldErrors, "name")}>
              <Input id="name" name="name" required disabled={disabled} minLength={2} maxLength={120} defaultValue={business.name} />
            </Field>
            <Field label="Business type" htmlFor="businessType" error={fieldError(fieldErrors, "businessType")}>
              <Select id="businessType" name="businessType" disabled={disabled} defaultValue={business.business_type}>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone" htmlFor="phone" error={fieldError(fieldErrors, "phone")}>
              <Input id="phone" name="phone" type="tel" disabled={disabled} maxLength={32} defaultValue={business.phone ?? ""} />
            </Field>
            <Field label="Email" htmlFor="email" error={fieldError(fieldErrors, "email")}>
              <Input id="email" name="email" type="email" disabled={disabled} defaultValue={business.email ?? ""} />
            </Field>
          </div>

          <Field label="Address" htmlFor="address" error={fieldError(fieldErrors, "address")}>
            <Input id="address" name="address" disabled={disabled} maxLength={300} defaultValue={business.address ?? ""} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Timezone" htmlFor="timezone" error={fieldError(fieldErrors, "timezone")}>
              <Select id="timezone" name="timezone" disabled={disabled} defaultValue={business.timezone}>
                {TIMEZONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="currency" error={fieldError(fieldErrors, "currency")}>
              <Select id="currency" name="currency" disabled={disabled} defaultValue={business.currency}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Default AI language" htmlFor="language" error={fieldError(fieldErrors, "language")}>
              <Select id="language" name="language" disabled={disabled} defaultValue={business.default_language}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Slot interval (min)" htmlFor="slotInterval" error={fieldError(fieldErrors, "slotInterval")}>
              <Input id="slotInterval" name="slotInterval" type="number" min={5} max={120} step={5} disabled={disabled} defaultValue={business.slot_interval_minutes} />
            </Field>
            <Field label="Minimum notice (min)" htmlFor="leadMinutes" error={fieldError(fieldErrors, "leadMinutes")}>
              <Input id="leadMinutes" name="leadMinutes" type="number" min={0} max={10080} disabled={disabled} defaultValue={business.booking_lead_minutes} />
            </Field>
            <Field label="Max advance booking (days)" htmlFor="horizonDays" error={fieldError(fieldErrors, "horizonDays")}>
              <Input id="horizonDays" name="horizonDays" type="number" min={1} max={365} disabled={disabled} defaultValue={business.booking_horizon_days} />
            </Field>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" name="aiEnabled" disabled={disabled} defaultChecked={business.ai_enabled} className="size-4 rounded border-slate-300 text-brand-600" />
              Enable Gemini AI automatic replies on Messenger
            </label>
            <Field
              label="Custom AI assistant instructions (optional)"
              htmlFor="aiInstructions"
              hint="Tone and style tips for your business. Never overrides booking or security rules."
              error={fieldError(fieldErrors, "aiInstructions")}
            >
              <Textarea id="aiInstructions" name="aiInstructions" disabled={disabled} maxLength={2000} defaultValue={business.ai_instructions ?? ""} />
            </Field>
          </div>

          {!disabled && (
            <div className="flex justify-end">
              <SubmitButton>Save settings</SubmitButton>
            </div>
          )}
        </>
      )}
    </ActionForm>
  );
}

export function BusinessHoursForm({ hours, disabled }: { hours: BusinessHours[]; disabled?: boolean }) {
  return (
    <ActionForm action={updateHoursAction} className="space-y-3">
      {() => (
        <>
          <div className="divide-y divide-slate-100">
            {hours.map((h) => (
              <div key={h.day_of_week} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-28 text-sm font-medium text-slate-800">{DAY_NAMES[h.day_of_week]}</span>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name={`closed_${h.day_of_week}`} disabled={disabled} defaultChecked={h.is_closed} className="size-4 rounded border-slate-300 text-brand-600" />
                  Closed
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <Input
                    type="time"
                    name={`open_${h.day_of_week}`}
                    disabled={disabled}
                    defaultValue={h.open_time.slice(0, 5)}
                    aria-label={`${DAY_NAMES[h.day_of_week]} opening time`}
                    className="w-32"
                  />
                  <span className="text-slate-400">–</span>
                  <Input
                    type="time"
                    name={`close_${h.day_of_week}`}
                    disabled={disabled}
                    defaultValue={h.close_time.slice(0, 5)}
                    aria-label={`${DAY_NAMES[h.day_of_week]} closing time`}
                    className="w-32"
                  />
                </div>
              </div>
            ))}
          </div>
          {!disabled && (
            <div className="flex justify-end pt-2">
              <SubmitButton>Save opening hours</SubmitButton>
            </div>
          )}
        </>
      )}
    </ActionForm>
  );
}

export function TeamSection({
  members,
  invitations,
  currentUserId,
  canManage,
}: {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string | null;
  canManage: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-6">
      {canManage && (
        <ActionForm
          action={inviteMemberAction}
          resetOnSuccess
          hideSuccess
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4"
        >
          {({ fieldErrors, result }) => {
            const inviteResult = result as ActionResult<{ link: string }> | null;
            return (
              <>
                <p className="text-sm font-medium text-slate-900">Invite a teammate</p>
                {inviteResult?.ok && inviteResult.data?.link && (
                  <Alert tone="success" title="Invitation link created (shown once)">
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="break-all rounded bg-white px-2 py-1 text-xs text-slate-800 ring-1 ring-emerald-200">
                        {inviteResult.data.link}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard?.writeText(inviteResult.data!.link);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </Alert>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <Input name="email" type="email" required placeholder="teammate@salon.com" aria-label="Teammate email" />
                    {fieldError(fieldErrors, "email") && <p className="mt-1 text-xs text-red-600">{fieldError(fieldErrors, "email")}</p>}
                  </div>
                  <Select name="role" defaultValue="staff" className="sm:w-36" aria-label="Role">
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </Select>
                  <SubmitButton>
                    <UserPlus className="size-4" aria-hidden /> Invite
                  </SubmitButton>
                </div>
              </>
            );
          }}
        </ActionForm>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Members ({members.length})</h3>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {m.email ?? `User ${m.user_id.slice(0, 8)}…`}
                  {m.user_id === currentUserId && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "owner" ? "violet" : "gray"}>{m.role}</Badge>
                {canManage && m.role !== "owner" && (
                  <ConfirmActionButton action={removeMemberAction.bind(null, m.id)} confirmText="Remove this member from the business?" variant="danger">
                    <Trash2 className="size-3.5" /> Remove
                  </ConfirmActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {invitations.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pending invitations ({invitations.length})</h3>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{inv.email}</p>
                  <p className="text-xs text-slate-500">Role: {inv.role}</p>
                </div>
                {canManage && (
                  <ConfirmActionButton action={revokeInvitationAction.bind(null, inv.id)} confirmText={`Revoke invitation for ${inv.email}?`} variant="secondary">
                    Revoke
                  </ConfirmActionButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
