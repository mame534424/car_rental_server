import { Router } from "express";
import { getCar, listCars } from "../controllers/car.controller";
import { validate } from "../middlewares/validate.middleware";
import { carAvailabilityQuerySchema, carIdParamSchema } from "../validations/car.validation";

const router = Router();

router.get("/", validate(carAvailabilityQuerySchema), listCars);
router.get("/:id", validate(carIdParamSchema), getCar);

export default router;
