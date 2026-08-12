import { z } from "zod";
import { CAR_STATUS } from "../constants";

const carStatusEnum = z.enum([
  CAR_STATUS.AVAILABLE,
  CAR_STATUS.MAINTENANCE,
  CAR_STATUS.UNAVAILABLE,
]);

export const createCarSchema = z.object({
  body: z.object({
    brand: z.string().min(1, "Brand is required"),
    model: z.string().min(1, "Model is required"),
    description: z.string().optional(),
    imageUrl: z.string().url().optional().or(z.literal("")),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    pricePerDay: z.coerce.number().positive("Price per day must be positive"),
    status: carStatusEnum.optional(),
  }),
});

export const updateCarSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    brand: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    description: z.string().optional(),
    imageUrl: z.string().url().optional().or(z.literal("")),
    quantity: z.coerce.number().int().min(1).optional(),
    pricePerDay: z.coerce.number().positive().optional(),
    status: carStatusEnum.optional(),
  }),
});

export const carAvailabilityQuerySchema = z.object({
  query: z.object({
    pickupDate: z.string().datetime().optional(),
    returnDate: z.string().datetime().optional(),
  }),
});

export const carIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
