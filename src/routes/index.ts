import { Router } from "express";
import authRoutes from "./auth.routes";
import carRoutes from "./car.routes";
import bookingRoutes from "./booking.routes";
import paymentRoutes from "./payment.routes";
import adminRoutes from "./admin.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/cars", carRoutes);
router.use("/bookings", bookingRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);

export default router;
