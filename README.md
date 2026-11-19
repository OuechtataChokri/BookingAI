# BookAI – AI WhatsApp Booking SaaS

Multi-tenant SaaS for barbershops, beauty salons, and appointment-based businesses. Customers chat on WhatsApp in **Tunisian Arabic (Derja)**, **Standard Arabic**, **French**, or **English**, and an AI assistant powered by **Google Gemini** (`@google/genai`) checks real availability and books appointments directly in PostgreSQL.

## Architecture Overview

- **Framework**: Next.js (App Router) + TypeScript + Tailwind CSS (modular monolith).
- **Database & Auth**: Supabase (PostgreSQL + Auth + Row Level Security). Every tenant table is scoped by `business_id` and enforced by RLS.
- **Atomic Booking Engine** (`lib/booking/` + `book_appointment` SQL RPC):
  - Checks business hours, staff working days/shifts, service duration, lead time, and existing appointments.
  - PostgreSQL `EXCLUDE USING GIST` constraint guarantees zero double-bookings even under concurrent requests.
  - All timestamps are stored in **UTC** (`timestamptz`) and converted to each business's local timezone (`lib/time.ts`).
- **AI Assistant** (`lib/ai/`):
  - Provider-neutral `AiProvider` interface implemented by `GeminiProvider` using `@google/genai`.
  - Function calling tools (`get_services`, `get_business_hours`, `get_available_slots`, `create_appointment`, `get_my_appointments`, `cancel_appointment`, `request_human_support`) validate all inputs with Zod and enforce tenant & customer isolation on the server.
- **WhatsApp Business Cloud API** (`lib/whatsapp/`, `app/api/whatsapp/webhook/route.ts`):
  - Verifies Meta `X-Hub-Signature-256` HMAC over the raw request body.
  - Resolves the business strictly from `metadata.phone_number_id`.
  - Guarantees idempotent processing using a `UNIQUE` constraint on `wa_message_id`.
  - Encrypts stored access tokens with AES-256-GCM (`lib/crypto.ts`).

---

## Quick Start (Demo Mode)

Without any `.env.local` file, BookAI runs in **Demo Mode** using sample data so you can explore the UI right away:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/dashboard`.

---

## Production / Live Setup

### 1. Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

### 2. Supabase (Database & Auth)

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret, server-only)
3. Open **SQL Editor** in Supabase and run the migration files in order:
   - [`supabase/migrations/20261115000000_init.sql`](supabase/migrations/20261115000000_init.sql)
   - [`supabase/migrations/20261118000000_messenger.sql`](supabase/migrations/20261118000000_messenger.sql)
4. In **Authentication → URL Configuration**, add your app URLs to **Redirect URLs**:
   - `http://localhost:3000/auth/callback` (local)
   - `https://your-domain.vercel.app/auth/callback` (production)

### 3. Google Gemini AI

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Set in `.env.local`:
   - `GEMINI_API_KEY=your_key`
   - `GEMINI_MODEL=gemini-3.5-flash-lite` (fast, recommended for chat; or `gemini-3.8-flash`)

### 4. Encryption Key

Generate a 32-byte encryption key for stored WhatsApp tokens:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the output in `TOKEN_ENCRYPTION_KEY`.

### 5. Facebook Messenger Platform (Meta)

1. In [Meta for Developers](https://developers.facebook.com/), create an app with the **Messenger** product.
2. Set `MESSENGER_APP_SECRET` (App Settings → Basic → App Secret) and `MESSENGER_VERIFY_TOKEN` (any random secret string you choose).
3. Deploy the app (or use a tunnel locally) and configure the webhook in Meta (**Messenger → Messenger API Settings → Webhooks**):
   - **Callback URL**: `https://your-domain.vercel.app/api/messenger/webhook`
   - **Verify token**: same value as `MESSENGER_VERIFY_TOKEN`
   - Subscribe your Facebook Page to the **`messages`** (and optionally **`message_deliveries`**) field.
4. In the BookAI dashboard (**Messenger Integration**), enter your **Facebook Page ID** and **Page Access Token**, or enable **Mock Mode** to test with the built-in Conversations simulator first.

---

## Verification & Checks

Run all checks locally before deploying:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Or run them all at once:

```bash
npm run check
```

## Deploy to Vercel

1. Push the repository to GitHub (`.env.local` is gitignored).
2. Import the project in [Vercel](https://vercel.com).
3. Add all variables from `.env.example` in Vercel **Project Settings → Environment Variables**, setting `NEXT_PUBLIC_APP_URL` to your `https://...vercel.app` URL.
4. Deploy!
