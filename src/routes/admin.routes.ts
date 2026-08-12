import { Router } from "express";
import {
  adminListCars,
  createCar,
  deleteCar,
  updateCar,
} from "../controllers/car.controller";
import {
  approveBooking,
  cancelBooking,
  completeBooking,
  createManualBooking,
  getBooking,
  listBookings,
  rejectBooking,
  todaysRentals,
} from "../controllers/booking.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createCarSchema, updateCarSchema } from "../validations/car.validation";
import {
  bookingIdParamSchema,
  manualBookingSchema,
  rejectBookingSchema,
} from "../validations/booking.validation";

const router = Router();

// Everything under /api/admin requires a valid access token.
router.use(requireAuth);

// Cars
router.get("/cars", adminListCars);
router.post("/cars", validate(createCarSchema), createCar);
router.patch("/cars/:id", validate(updateCarSchema), updateCar);
router.delete("/cars/:id", deleteCar);

// Bookings
router.get("/bookings", listBookings);
router.get("/bookings/today", todaysRentals);
router.get("/bookings/:id", validate(bookingIdParamSchema), getBooking);
router.post("/bookings/manual", validate(manualBookingSchema), createManualBooking);
router.patch("/bookings/:id/approve", validate(bookingIdParamSchema), approveBooking);
router.patch("/bookings/:id/reject", validate(rejectBookingSchema), rejectBooking);
router.patch("/bookings/:id/cancel", validate(bookingIdParamSchema), cancelBooking);
router.patch("/bookings/:id/complete", validate(bookingIdParamSchema), completeBooking);

export default router;
