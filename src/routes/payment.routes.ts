import { Router } from "express";
import multer from "multer";

import {
  submitReceipt,
} from "../controllers/payment.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.post(
  "/submit-receipt",
  upload.single("receipt"),
  submitReceipt
);
 
export default router;