import { z } from "zod";

export const checkoutSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid("Valid bookingId is required"),
  }),
});

export const verifyPaymentSchema = z.object({
  params: z.object({
    transactionReference: z.string().min(1),
  }),
});
