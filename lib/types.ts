// Shared domain types (mirror the SQL schema).

export type Role = "owner" | "admin" | "staff";
export type Language = "ar-TN" | "ar" | "fr" | "en";
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface Business {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  default_language: Language;
  slot_interval_minutes: number;
  booking_lead_minutes: number;
  booking_horizon_days: number;
  ai_enabled: boolean;
  ai_instructions: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  is_active: boolean;
  created_at: string;
}

export interface Staff {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_active: boolean;
  working_days: number[];
  work_start: string | null;
  work_end: string | null;
  created_at: string;
  service_ids?: string[];
}

export interface BusinessHours {
  id?: string;
  business_id?: string;
  day_of_week: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string | null;
  phone: string | null;
  messenger_psid?: string | null;
  email: string | null;
  notes: string | null;
  language: Language | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  customer_id: string;
  service_id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  price_cents: number;
  source: "dashboard" | "whatsapp" | "messenger";
  notes: string | null;
  created_at: string;
  customer?: Pick<Customer, "id" | "name" | "phone" | "messenger_psid"> | null;
  service?: Pick<Service, "id" | "name" | "duration_minutes"> | null;
  staff?: Pick<Staff, "id" | "name"> | null;
}

export interface Conversation {
  id: string;
  business_id: string;
  customer_id: string;
  wa_contact: string;
  channel?: "whatsapp" | "messenger";
  status: "ai" | "human" | "closed";
  needs_human: boolean;
  last_message_at: string;
  last_message_preview: string | null;
  customer?: Pick<Customer, "id" | "name" | "phone" | "messenger_psid"> | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "staff" | "system";
  body: string;
  status: string;
  error: string | null;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  created_at: string;
}

export interface MessengerConnection {
  id: string;
  business_id: string;
  mode: "live" | "mock";
  status: "connected" | "disconnected" | "error" | "mock";
  page_id: string | null;
  page_name: string | null;
  last_verified_at: string | null;
  last_error: string | null;
}

export interface WhatsAppConnection {
  id: string;
  business_id: string;
  mode: "live" | "mock";
  status: "connected" | "disconnected" | "error" | "mock";
  phone_number_id: string | null;
  waba_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  last_verified_at: string | null;
  last_error: string | null;
}

export interface Subscription {
  plan: "trial" | "starter" | "pro" | "business";
  status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export interface Member {
  id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email?: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };
