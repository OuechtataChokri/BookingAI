import "server-only";

/**
 * Central place that reads environment variables on the server.
 * Nothing in this file is ever sent to the browser.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  // Messenger Platform (falls back to WHATSAPP_* if already set)
  messengerVerifyToken: process.env.MESSENGER_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || "",
  messengerAppSecret: process.env.MESSENGER_APP_SECRET || process.env.WHATSAPP_APP_SECRET || "",
  messengerPageId: process.env.MESSENGER_PAGE_ID ?? "",
  messengerPageAccessToken: process.env.MESSENGER_PAGE_ACCESS_TOKEN ?? "",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  isProduction: process.env.NODE_ENV === "production",
};

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isServiceRoleConfigured = () => Boolean(isSupabaseConfigured() && env.supabaseServiceRoleKey);
export const isGeminiConfigured = () => Boolean(env.geminiApiKey);
export const isMessengerWebhookConfigured = () => Boolean(env.messengerVerifyToken && env.messengerAppSecret);
export const isWhatsAppWebhookConfigured = () => Boolean(env.whatsappVerifyToken && env.whatsappAppSecret);

export const META_GRAPH_VERSION = "v23.0";
export const WHATSAPP_GRAPH_VERSION = META_GRAPH_VERSION;
