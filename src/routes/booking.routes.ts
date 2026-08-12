import { Router } from "express";
import { createBooking } from "../controllers/booking.controller";
import { uploadIdDocument } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createBookingSchema } from "../validations/booking.validation";

const router = Router();

router.post("/", uploadIdDocument, validate(createBookingSchema), createBooking);

export default router;
