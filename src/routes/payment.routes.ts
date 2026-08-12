import { Router } from "express";
import { checkout, mockCheckoutPage, verify } from "../controllers/payment.controller";
import { validate } from "../middlewares/validate.middleware";
import { checkoutSchema, verifyPaymentSchema } from "../validations/payment.validation";

const router = Router();

router.post("/checkout", validate(checkoutSchema), checkout);
router.get("/mock-checkout/:transactionReference", mockCheckoutPage);
router.post("/verify/:transactionReference", validate(verifyPaymentSchema), verify);

export default router;
