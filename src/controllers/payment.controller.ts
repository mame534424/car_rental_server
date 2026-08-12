import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { BOOKING_STATUS, PAYMENT_STATUS } from "../constants";
import { initializeCheckout, verifyTransaction } from "../services/payment.service";
import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

// POST /api/payments/checkout — step 1: create a PENDING payment + fake checkout url
export const checkout = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId } = req.body;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true },
  });
  if (!booking) throw ApiError.notFound("Booking not found");
  if (booking.bookingStatus !== BOOKING_STATUS.PENDING_PAYMENT) {
    throw ApiError.conflict("This booking is not awaiting payment");
  }

  const { transactionReference, checkoutUrl } = await initializeCheckout({
    amount: Number(booking.totalAmount),
    customerEmail: booking.customer.email ?? undefined,
    customerName: booking.customer.name,
  });

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount: booking.totalAmount,
      provider: "chapa_mock",
      status: PAYMENT_STATUS.PENDING,
      transactionReference,
      checkoutUrl,
    },
  });

  return sendSuccess(
    res,
    { checkoutUrl, transactionReference: payment.transactionReference },
    "Checkout created"
  );
});

// POST /api/payments/verify/:transactionReference — step 2: simulate Chapa webhook/redirect
export const verify = asyncHandler(async (req: Request, res: Response) => {
  const { transactionReference } = req.params;

  const payment = await prisma.payment.findUnique({
    where: { transactionReference },
    include: { booking: true },
  });
  if (!payment) throw ApiError.notFound("Payment not found");

  if (payment.status === PAYMENT_STATUS.PAID) {
    return sendSuccess(res, payment, "Payment already verified");
  }

  const result = await verifyTransaction(transactionReference);

  if (!result.success) {
    const failed = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PAYMENT_STATUS.FAILED },
    });
    throw ApiError.badRequest("Payment verification failed", failed);
  }

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: PAYMENT_STATUS.PAID },
    }),
    prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        paymentStatus: PAYMENT_STATUS.PAID,
        bookingStatus: BOOKING_STATUS.PENDING_VERIFICATION,
      },
    }),
  ]);

  return sendSuccess(res, updatedPayment, "Payment verified, booking pending admin verification");
});

// GET /api/payments/mock-checkout/:transactionReference — stand-in "hosted" page for the demo
export const mockCheckoutPage = asyncHandler(async (req: Request, res: Response) => {
  const { transactionReference } = req.params;
  const payment = await prisma.payment.findUnique({ where: { transactionReference } });
  if (!payment) throw ApiError.notFound("Payment not found");

  res.send(`
    <html>
      <body style="font-family: sans-serif; text-align:center; padding-top: 80px;">
        <h2>Mock Chapa Checkout</h2>
        <p>Amount: ${payment.amount} ETB</p>
        <p>Reference: ${payment.transactionReference}</p>
        <p>This is a placeholder page for the MVP. In production this would be Chapa's hosted page.</p>
        <form method="POST" action="/api/payments/verify/${payment.transactionReference}">
          <button type="submit">Simulate Successful Payment</button>
        </form>
      </body>
    </html>
  `);
});
