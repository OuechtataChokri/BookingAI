import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500">Pick a strong password you have not used elsewhere.</p>
      <ResetForm />
    </>
  );
}
