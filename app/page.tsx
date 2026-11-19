import Link from "next/link";
import { CalendarCheck2, Clock, Languages, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { buttonStyles } from "@/components/ui";

const features = [
  { icon: MessageCircle, title: "Bookings on Messenger", text: "Customers chat with your Facebook Page – no app to install, no forms to fill." },
  { icon: Sparkles, title: "AI assistant (Gemini)", text: "Answers questions about services, prices and hours, then books the appointment." },
  { icon: Languages, title: "Speaks your customers' language", text: "Tunisian Arabic, Standard Arabic, French and English – replies in the language used." },
  { icon: Clock, title: "No double bookings", text: "The backend checks hours, staff and duration. The AI can never invent a free slot." },
  { icon: ShieldCheck, title: "Private by design", text: "Every business only sees its own data, enforced by the database itself." },
  { icon: CalendarCheck2, title: "Simple dashboard", text: "Calendar, customers, staff, services and conversations in one clean place." },
];

export default function LandingPage() {
  return (
    <div className="bg-gradient-to-b from-brand-50 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <CalendarCheck2 className="size-5" />
          </span>
          BookAI
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonStyles("ghost")}>
            Log in
          </Link>
          <Link href="/signup" className={buttonStyles("primary")}>
            Start free trial
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-14 text-center sm:pt-24">
          <p className="mx-auto mb-5 inline-flex rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">For barbershops, salons & appointment businesses</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">Your Facebook Messenger, answering and booking for you.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            BookAI gives every business an AI assistant that talks to customers on Facebook Messenger, shows real availability and confirms appointments – 24/7.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonStyles("primary")}>
              Create your account
            </Link>
            <Link href="/dashboard" className={buttonStyles("secondary")}>
              Explore the dashboard
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h2>
              <p className="mt-1.5 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-500">© {new Date().getFullYear()} BookAI</footer>
    </div>
  );
}
