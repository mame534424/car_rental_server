# Lumen Car Rental — Backend (MVP)

Node.js + Express + TypeScript + Prisma + Supabase (Postgres + Storage).

## Setup

```bash
npm install
cp .env.example .env   # fill in your real Supabase/JWT values
npx prisma migrate dev --name init
npm run seed            # creates the single admin account
npm run dev              # http://localhost:4000
```

Before seeding, create a **private** bucket in Supabase Storage named to match
`SUPABASE_STORAGE_BUCKET` (default: `id-documents`).

## Auth

- Single admin role. `POST /api/auth/login` sets `accessToken` (15m) and
  `refreshToken` (7d) as httpOnly cookies.
- `POST /api/auth/refresh` rotates both using the refresh cookie.
- `POST /api/auth/logout` invalidates the stored refresh token hash.
- All `/api/admin/*` routes require a valid `accessToken` cookie.

## Payments (Chapa-mock, two-step)

1. `POST /api/payments/checkout` — booking must be `PENDING_PAYMENT`. Creates a
   `Payment` row as `PENDING` with a fake `checkoutUrl`, returns it.
2. `POST /api/payments/verify/:transactionReference` — simulates the
   Chapa webhook/redirect. Flips the payment to `PAID` and the booking to
   `PENDING_VERIFICATION` (awaiting admin approval).

Swapping in real Chapa later only requires editing
`src/services/payment.service.ts` — controllers and routes stay the same.

## Booking lifecycle

`PENDING_PAYMENT` → (pay) → `PENDING_VERIFICATION` → (admin approves) →
`CONFIRMED` → (admin marks complete) → `COMPLETED`

Admin can also `REJECTED` a pending booking or `CANCELLED` a confirmed one.

## Route map

Public:
- `GET /api/cars`, `GET /api/cars/:id`
- `POST /api/bookings` (multipart, includes ID document)
- `POST /api/payments/checkout`, `POST /api/payments/verify/:ref`

Admin (cookie-protected, `/api/admin/*`):
- `GET/POST/PATCH/DELETE /cars`
- `GET /bookings`, `GET /bookings/today`, `GET /bookings/:id`
- `POST /bookings/manual`
- `PATCH /bookings/:id/approve|reject|cancel|complete`

## Notes / MVP simplifications

- One admin role — no granular permissions.
- No subdomain-aware routing server-side; that's a frontend/DNS concern.
  Backend just needs CORS origins set via `FRONTEND_URL` / `ADMIN_FRONTEND_URL`.
- ID documents live in a private bucket; admins view them via short-lived
  signed URLs (5 min expiry).
- "Today" for the rentals dashboard is computed against Africa/Addis_Ababa
  (UTC+3, no DST).
