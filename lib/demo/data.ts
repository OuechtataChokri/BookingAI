import type {
  Appointment,
  Business,
  BusinessHours,
  Conversation,
  Customer,
  Message,
  MessengerConnection,
  Service,
  Staff,
  Subscription,
  WhatsAppConnection,
} from "@/lib/types";

/**
 * DEMO DATA – used ONLY when Supabase environment variables are missing.
 * The UI shows a clear "Demo mode" banner whenever this data is displayed.
 */
const B = "00000000-0000-4000-8000-000000000001";
const iso = (d: Date) => d.toISOString();

export const demoBusiness: Business = {
  id: B,
  name: "Salon Yasmine (Demo)",
  slug: "salon-yasmine-demo",
  business_type: "beauty_salon",
  phone: "+216 20 123 456",
  email: "contact@salon-yasmine.tn",
  address: "Avenue Habib Bourguiba, Tunis",
  timezone: "Africa/Tunis",
  currency: "TND",
  default_language: "fr",
  slot_interval_minutes: 15,
  booking_lead_minutes: 60,
  booking_horizon_days: 30,
  ai_enabled: true,
  ai_instructions: "Be warm and friendly. Recommend the beard trim with every haircut.",
  created_at: "2026-01-10T09:00:00.000Z",
};

export const demoServices: Service[] = [
  { id: "s1", business_id: B, name: "Men's haircut", description: "Classic or modern cut", duration_minutes: 30, price_cents: 2500, is_active: true, created_at: "" },
  { id: "s2", business_id: B, name: "Beard trim", description: "Shape & hot towel", duration_minutes: 20, price_cents: 1500, is_active: true, created_at: "" },
  { id: "s3", business_id: B, name: "Brushing", description: "Wash & blow-dry", duration_minutes: 45, price_cents: 3000, is_active: true, created_at: "" },
  { id: "s4", business_id: B, name: "Hair coloring", description: "Full color", duration_minutes: 120, price_cents: 12000, is_active: true, created_at: "" },
  { id: "s5", business_id: B, name: "Manicure", description: null, duration_minutes: 40, price_cents: 3500, is_active: false, created_at: "" },
];

export const demoStaff: Staff[] = [
  { id: "t1", business_id: B, name: "Karim", email: "karim@example.com", phone: null, title: "Senior barber", is_active: true, working_days: [1, 2, 3, 4, 5, 6], work_start: null, work_end: null, created_at: "", service_ids: ["s1", "s2"] },
  { id: "t2", business_id: B, name: "Yasmine", email: "yasmine@example.com", phone: null, title: "Hair stylist", is_active: true, working_days: [2, 3, 4, 5, 6], work_start: "10:00", work_end: "18:00", created_at: "", service_ids: [] },
  { id: "t3", business_id: B, name: "Sami", email: null, phone: null, title: "Barber", is_active: true, working_days: [1, 3, 5, 6], work_start: null, work_end: null, created_at: "", service_ids: ["s1", "s2"] },
];

export const demoHours: BusinessHours[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  day_of_week: d,
  is_closed: d === 0,
  open_time: "09:00",
  close_time: d === 6 ? "17:00" : "19:00",
}));

const names = ["Ahmed Ben Ali", "Mariem Trabelsi", "Youssef Gharbi", "Ines Jaziri", "Omar Mansour", "Sarra Bouzid", "Mehdi Hamdi", "Nour Chaabane"];
export const demoCustomers: Customer[] = names.map((name, i) => ({
  id: `c${i + 1}`,
  business_id: B,
  name,
  phone: `2162${String(1000000 + i * 137531).slice(0, 7)}`,
  email: null,
  notes: i === 1 ? "Prefers Yasmine" : null,
  language: (["ar-TN", "fr", "ar-TN", "fr", "ar", "en", "ar-TN", "fr"] as const)[i],
  created_at: iso(new Date(Date.now() - (30 - i) * 86_400_000)),
}));

function buildAppointments(): Appointment[] {
  const out: Appointment[] = [];
  const base = new Date();
  base.setUTCMinutes(0, 0, 0);
  const slots = [
    [-12, 9], [-9, 10], [-7, 14], [-5, 11], [-3, 15], [-2, 9], [-1, 13], [-1, 16],
    [0, 8], [0, 10], [0, 13], [0, 15], [1, 9], [1, 11], [2, 14], [3, 10], [4, 15], [6, 12],
  ];
  slots.forEach(([dayOffset, hourUtc], i) => {
    const svc = demoServices[i % 4];
    const stf = demoStaff[i % 3];
    const cus = demoCustomers[i % demoCustomers.length];
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() + dayOffset);
    start.setUTCHours(hourUtc, 0, 0, 0);
    const end = new Date(start.getTime() + svc.duration_minutes * 60_000);
    const past = end.getTime() < Date.now();
    out.push({
      id: `a${i + 1}`,
      business_id: B,
      customer_id: cus.id,
      service_id: svc.id,
      staff_id: stf.id,
      starts_at: iso(start),
      ends_at: iso(end),
      status: past ? (i === 3 ? "no_show" : i === 5 ? "cancelled" : "completed") : "confirmed",
      price_cents: svc.price_cents,
      source: i % 3 === 0 ? "dashboard" : "whatsapp",
      notes: null,
      created_at: iso(new Date(start.getTime() - 3 * 86_400_000)),
      customer: { id: cus.id, name: cus.name, phone: cus.phone },
      service: { id: svc.id, name: svc.name, duration_minutes: svc.duration_minutes },
      staff: { id: stf.id, name: stf.name },
    });
  });
  return out;
}

export const demoAppointments: Appointment[] = buildAppointments();

const ago = (min: number) => iso(new Date(Date.now() - min * 60_000));

export const demoConversations: Conversation[] = [
  { id: "v1", business_id: B, customer_id: "c1", wa_contact: demoCustomers[0].phone ?? "", channel: "messenger", status: "ai", needs_human: false, last_message_at: ago(4), last_message_preview: "C'est confirmé ✅ Demain à 10:00 avec Karim.", customer: demoCustomers[0] },
  { id: "v2", business_id: B, customer_id: "c3", wa_contact: demoCustomers[2].phone ?? "", channel: "messenger", status: "human", needs_human: true, last_message_at: ago(38), last_message_preview: "N7eb nkalem m3a 7ad mel salon", customer: demoCustomers[2] },
  { id: "v3", business_id: B, customer_id: "c6", wa_contact: demoCustomers[5].phone ?? "", channel: "messenger", status: "ai", needs_human: false, last_message_at: ago(180), last_message_preview: "We're open today from 09:00 to 19:00.", customer: demoCustomers[5] },
];

export const demoMessages: Record<string, Message[]> = {
  v1: [
    { id: "m1", conversation_id: "v1", direction: "inbound", sender: "customer", body: "Aslema, 3andkom blasa ghodwa lel coiffure?", status: "received", error: null, ai_input_tokens: null, ai_output_tokens: null, created_at: ago(9) },
    { id: "m2", conversation_id: "v1", direction: "outbound", sender: "ai", body: "Aslema! Ghodwa 3andna: 09:00, 10:00, 11:30 m3a Karim. Chnowa ye5dmek?", status: "read", error: null, ai_input_tokens: 812, ai_output_tokens: 41, created_at: ago(8) },
    { id: "m3", conversation_id: "v1", direction: "inbound", sender: "customer", body: "10:00 behi", status: "received", error: null, ai_input_tokens: null, ai_output_tokens: null, created_at: ago(5) },
    { id: "m4", conversation_id: "v1", direction: "outbound", sender: "ai", body: "C'est confirmé ✅ Demain à 10:00 avec Karim.", status: "delivered", error: null, ai_input_tokens: 960, ai_output_tokens: 28, created_at: ago(4) },
  ],
  v2: [
    { id: "m5", conversation_id: "v2", direction: "inbound", sender: "customer", body: "N7eb nkalem m3a 7ad mel salon", status: "received", error: null, ai_input_tokens: null, ai_output_tokens: null, created_at: ago(38) },
  ],
  v3: [
    { id: "m6", conversation_id: "v3", direction: "inbound", sender: "customer", body: "Hi, what time do you close today?", status: "received", error: null, ai_input_tokens: null, ai_output_tokens: null, created_at: ago(181) },
    { id: "m7", conversation_id: "v3", direction: "outbound", sender: "ai", body: "We're open today from 09:00 to 19:00.", status: "read", error: null, ai_input_tokens: 640, ai_output_tokens: 15, created_at: ago(180) },
  ],
};

export const demoMessenger: MessengerConnection = {
  id: "msg1",
  business_id: B,
  mode: "live",
  status: "disconnected",
  page_id: null,
  page_name: null,
  last_verified_at: null,
  last_error: null,
};

export const demoWhatsApp: WhatsAppConnection = {
  id: "w1",
  business_id: B,
  mode: "live",
  status: "disconnected",
  phone_number_id: null,
  waba_id: null,
  display_phone_number: null,
  verified_name: null,
  last_verified_at: null,
  last_error: null,
};

export const demoSubscription: Subscription = {
  plan: "trial",
  status: "trialing",
  trial_ends_at: iso(new Date(Date.now() + 9 * 86_400_000)),
  current_period_end: null,
};
