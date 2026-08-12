export const BOOKING_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
} as const;

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
} as const;

export const CAR_STATUS = {
  AVAILABLE: "AVAILABLE",
  MAINTENANCE: "MAINTENANCE",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export const IDENTIFICATION_TYPE = {
  FAYDA: "FAYDA",
  PASSPORT: "PASSPORT",
  NATIONAL_ID: "NATIONAL_ID",
  DRIVERS_LICENSE: "DRIVERS_LICENSE",
  OTHER: "OTHER",
} as const;

export const BOOKING_SOURCE = {
  ONLINE: "ONLINE",
  MANUAL: "MANUAL",
} as const;

// Bookings that still "hold" vehicle capacity for availability purposes.
// CANCELLED and REJECTED release the capacity back to the pool.
export const ACTIVE_BOOKING_STATUSES = [
  BOOKING_STATUS.PENDING_PAYMENT,
  BOOKING_STATUS.PENDING_VERIFICATION,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.COMPLETED,
] as const;

export const COOKIE_NAMES = {
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
} as const;

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

// Addis Ababa is UTC+3 year-round (no DST), used for "today" pickups/returns.
export const APP_TIMEZONE_OFFSET_HOURS = 3;

export const SIGNED_URL_EXPIRY_SECONDS = 60 * 5; // 5 minutes
