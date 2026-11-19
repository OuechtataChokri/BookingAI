"use client";

import { ActionForm, SubmitButton, fieldError } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui";
import { createBusinessAction } from "@/lib/actions/business";
import { BUSINESS_TYPES, CURRENCIES, LANGUAGES, TIMEZONES } from "@/lib/utils";

export function OnboardingForm() {
  return (
    <ActionForm action={createBusinessAction} className="mt-6 space-y-4">
      {({ fieldErrors }) => (
        <>
          <Field label="Business name" htmlFor="name" error={fieldError(fieldErrors, "name")}>
            <Input id="name" name="name" required minLength={2} maxLength={120} placeholder="Salon Yasmine" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type of business" htmlFor="businessType" error={fieldError(fieldErrors, "businessType")}>
              <Select id="businessType" name="businessType" defaultValue="barbershop">
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Business phone (optional)" htmlFor="phone" error={fieldError(fieldErrors, "phone")}>
              <Input id="phone" name="phone" type="tel" placeholder="+216 20 123 456" maxLength={32} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone" htmlFor="timezone" hint="Opening hours and bookings use this timezone." error={fieldError(fieldErrors, "timezone")}>
              <Select id="timezone" name="timezone" defaultValue="Africa/Tunis">
                {TIMEZONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="currency" error={fieldError(fieldErrors, "currency")}>
              <Select id="currency" name="currency" defaultValue="TND">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Default assistant language" htmlFor="language" hint="The assistant still replies in the customer's language." error={fieldError(fieldErrors, "language")}>
            <Select id="language" name="language" defaultValue="fr">
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton className="w-full">Create business</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
