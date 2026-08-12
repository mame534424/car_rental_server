import { z } from "zod";
import { IDENTIFICATION_TYPE, PAYMENT_STATUS } from "../constants";

const identificationTypeEnum = z.enum([
  IDENTIFICATION_TYPE.FAYDA,
  IDENTIFICATION_TYPE.PASSPORT,
  IDENTIFICATION_TYPE.NATIONAL_ID,
  IDENTIFICATION_TYPE.DRIVERS_LICENSE,
  IDENTIFICATION_TYPE.OTHER,
]);

const dateRangeRefinement = <T extends { pickupDate: string; returnDate: string }>(
  data: T,
  ctx: z.RefinementCtx
) => {
  const pickup = new Date(data.pickupDate);
  const ret = new Date(data.returnDate);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(ret.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid pickupDate/returnDate" });
    return;
  }
  if (ret <= pickup) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "returnDate must be after pickupDate",
      path: ["returnDate"],
    });
  }
};

// multipart/form-data -> all fields arrive as strings, so this schema
// validates the raw body used for an online booking (with ID upload).
export const createBookingSchema = z.object({
  body: z
    .object({
      carId: z.string().uuid("Valid carId is required"),
      pickupLocation: z.string().min(1, "Pickup location is required"),
      returnLocation: z.string().min(1, "Return location is required"),
      pickupDate: z.string().min(1, "pickupDate is required"),
      returnDate: z.string().min(1, "returnDate is required"),
      customerName: z.string().min(1, "Customer name is required"),
      customerPhone: z.string().min(6, "Valid phone number is required"),
      customerEmail: z.string().email().optional().or(z.literal("")),
      identificationType: identificationTypeEnum,
      identificationNumber: z.string().min(1, "Identification number is required"),
    })
    .superRefine(dateRangeRefinement),
});

export const manualBookingSchema = z.object({
  body: z
    .object({
      carId: z.string().uuid("Valid carId is required"),
      pickupLocation: z.string().min(1, "Pickup location is required"),
      returnLocation: z.string().min(1, "Return location is required"),
      pickupDate: z.string().min(1, "pickupDate is required"),
      returnDate: z.string().min(1, "returnDate is required"),
      customerName: z.string().min(1, "Customer name is required"),
      customerPhone: z.string().min(6, "Valid phone number is required"),
      customerEmail: z.string().email().optional().or(z.literal("")),
      identificationType: identificationTypeEnum,
      identificationNumber: z.string().min(1, "Identification number is required"),
      paymentStatus: z
        .enum([PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PAID])
        .default(PAYMENT_STATUS.PAID),
    })
    .superRefine(dateRangeRefinement),
});

export const bookingIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const rejectBookingSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});
