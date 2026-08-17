import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { BOOKING_STATUS, PAYMENT_STATUS } from "../constants";
import {
  getSignedPaymentReceiptUrl,
  uploadPaymentReceipt,
} from "../services/payment.service";
import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * POST /api/payments/submit-receipt
 *
 * Customer submits payment screenshot.
 *
 * multipart/form-data:
 * - bookingId
 * - receipt
 */
export const submitReceipt = asyncHandler(
  async (req: Request, res: Response) => {
    const { bookingId } = req.body;

    if (!bookingId) {
      throw ApiError.badRequest("bookingId is required");
    }

    if (!req.file) {
      throw ApiError.badRequest("Payment receipt screenshot is required");
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        payments: true,
      },
    });

    if (!booking) {
      throw ApiError.notFound("Booking not found");
    }

    if (booking.bookingStatus !== BOOKING_STATUS.PENDING_PAYMENT) {
      throw ApiError.conflict(
        "This booking is not awaiting payment"
      );
    }

    /**
     * Prevent duplicate payment submissions.
     */
    const existingSubmittedPayment = booking.payments.find(
      (payment) =>
        payment.status === 
    );

    if (existingSubmittedPayment) {
      throw ApiError.conflict(
        "A payment receipt has already been submitted for this booking"
      );
    }

    /**
     * Upload screenshot to Supabase Storage.
     */
    const receiptPath = await uploadPaymentReceipt(
      req.file,
      booking.id
    );

    /**
     * Create payment record and move booking
     * to admin verification in one transaction.
     */
    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount: booking.totalAmount,

          provider: "manual",

          status: PAYMENT_STATUS.SUBMITTED,

          receiptPath,
          receiptSubmittedAt: new Date(),
        },
      }),

      prisma.booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: BOOKING_STATUS.PENDING_VERIFICATION,
        },
      }),
    ]);

    return sendSuccess(
      res,
      {
        paymentId: payment.id,
        bookingId: booking.id,
        amount: payment.amount,
        status: payment.status,
        message:
          "Payment receipt submitted successfully. Waiting for admin verification.",
      },
      "Payment receipt submitted",
      201
    );
  }
);