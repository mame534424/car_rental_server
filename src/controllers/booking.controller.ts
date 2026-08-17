import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { BOOKING_SOURCE, BOOKING_STATUS, CAR_STATUS, PAYMENT_STATUS } from "../constants";
import { uploadIdDocument, getSignedDocumentUrl, getSignedPaymentReceiptUrl } from "../services/storage.service";
import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { calculateTotalAmount } from "../utils/pricing";
import { getTodayRangeInAppTimezone } from "../utils/dateRange";
import { ACTIVE_BOOKING_STATUSES } from "../constants";

async function assertCarAvailable(carId: string, pickup: Date, ret: Date, excludeBookingId?: string) {
  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car) throw ApiError.notFound("Car not found");
  if (car.status !== CAR_STATUS.AVAILABLE) {
    throw ApiError.conflict("This car is not currently available for booking");
  }

  const overlapping = await prisma.booking.count({
    where: {
      carId,
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
      pickupDate: { lt: ret },
      returnDate: { gt: pickup },
    },
  });

  if (overlapping >= car.quantity) {
    throw ApiError.conflict("No units of this car are available for the selected dates");
  }

  return car;
}

async function findOrCreateCustomer(input: {
  name: string;
  phone: string;
  email?: string;
  identificationType: string;
  identificationNumber: string;
  identificationDocumentPath?: string;
}) {
  const existing = await prisma.customer.findFirst({
    where: { identificationNumber: input.identificationNumber },
  });

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email || existing.email,
        identificationDocumentPath:
          input.identificationDocumentPath ?? existing.identificationDocumentPath,
      },
    });
  }

  return prisma.customer.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email || undefined,
      identificationType: input.identificationType as never,
      identificationNumber: input.identificationNumber,
      identificationDocumentPath: input.identificationDocumentPath,
    },
  });
}

// POST /api/bookings — public, multipart/form-data (with ID document)
export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  const {
    carId,
    pickupLocation,
    returnLocation,
    pickupDate,
    returnDate,
    customerName,
    customerPhone,
    customerEmail,
    identificationType,
    identificationNumber,
  } = req.body;

  const pickup = new Date(pickupDate);
  const ret = new Date(returnDate);

  const car = await assertCarAvailable(carId, pickup, ret);

  let documentPath: string | undefined;
  if (req.file) {
    documentPath = await uploadIdDocument(req.file, customerName);
  }

  const customer = await findOrCreateCustomer({
    name: customerName,
    phone: customerPhone,
    email: customerEmail,
    identificationType,
    identificationNumber,
    identificationDocumentPath: documentPath,
  });

  const totalAmount = calculateTotalAmount(pickup, ret, Number(car.pricePerDay));

  const booking = await prisma.booking.create({
    data: {
      customerId: customer.id,
      carId: car.id,
      pickupLocation,
      returnLocation,
      pickupDate: pickup,
      returnDate: ret,
      totalAmount,
      bookingStatus: BOOKING_STATUS.PENDING_PAYMENT,
      paymentStatus: PAYMENT_STATUS.PENDING,
      source: BOOKING_SOURCE.ONLINE,
    },
    include: { car: true, customer: true },
  });

  return sendSuccess(res, booking, "Booking created — proceed to payment", 201);
});

// POST /api/admin/bookings/manual — admin creates a walk-in booking
export const createManualBooking = asyncHandler(async (req: Request, res: Response) => {
  const {
    carId,
    pickupLocation,
    returnLocation,
    pickupDate,
    returnDate,
    customerName,
    customerPhone,
    customerEmail,
    identificationType,
    identificationNumber,
    paymentStatus,
  } = req.body;

  const pickup = new Date(pickupDate);
  const ret = new Date(returnDate);

  const car = await assertCarAvailable(carId, pickup, ret);

  const customer = await findOrCreateCustomer({
    name: customerName,
    phone: customerPhone,
    email: customerEmail,
    identificationType,
    identificationNumber,
  });

  const totalAmount = calculateTotalAmount(pickup, ret, Number(car.pricePerDay));
  const isPaid = paymentStatus === PAYMENT_STATUS.PAID;

  const booking = await prisma.booking.create({
    data: {
      customerId: customer.id,
      carId: car.id,
      pickupLocation,
      returnLocation,
      pickupDate: pickup,
      returnDate: ret,
      totalAmount,
      bookingStatus: isPaid ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING_PAYMENT,
      paymentStatus: isPaid ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING,
      source: BOOKING_SOURCE.MANUAL,
    },
    include: { car: true, customer: true },
  });

  if (isPaid) {
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: totalAmount,
        provider: "manual",
        status: PAYMENT_STATUS.PAID,
        transactionReference: `manual-${booking.id}`,
      },
    });
  }

  return sendSuccess(res, booking, "Manual booking created", 201);
});

// GET /api/admin/bookings — list all, optional ?status= filter
export const listBookings = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  if (status && !(Object.values(BOOKING_STATUS) as string[]).includes(status)) {
    throw ApiError.badRequest(
      `Invalid status filter. Allowed: ${Object.values(BOOKING_STATUS).join(", ")}`
    );
  }
  const bookings = await prisma.booking.findMany({
    where: status ? { bookingStatus: status as never } : undefined,
    include: { car: true, customer: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  return sendSuccess(res, bookings);
});

// GET /api/admin/bookings/today — pickups/returns due today, Addis Ababa time
export const todaysRentals = asyncHandler(async (_req: Request, res: Response) => {
  const { start, end } = getTodayRangeInAppTimezone();

  const [pickups, returns] = await Promise.all([
    prisma.booking.findMany({
      where: { pickupDate: { gte: start, lt: end }, bookingStatus: BOOKING_STATUS.CONFIRMED },
      include: { car: true, customer: true },
    }),
    prisma.booking.findMany({
      where: { returnDate: { gte: start, lt: end }, bookingStatus: BOOKING_STATUS.CONFIRMED },
      include: { car: true, customer: true },
    }),
  ]);

  return sendSuccess(res, { pickups, returns });
});

// GET /api/admin/bookings/:id
export const getBooking = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        car: true,
        customer: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!booking) {
      throw ApiError.notFound("Booking not found");
    }

    
    const documentPromise = booking.customer.identificationDocumentPath
      ? getSignedDocumentUrl(booking.customer.identificationDocumentPath)
      : Promise.resolve(null);

    const paymentsPromise = Promise.all(
      booking.payments.map(async (payment) => {
        const receiptUrl = payment.receiptPath
          ? await getSignedPaymentReceiptUrl(payment.receiptPath)
          : null;

        return {
          ...payment,
          receiptUrl,
        };
      })
    );
    
    const [identificationDocumentUrl, payments] = await Promise.all([
      documentPromise,
      paymentsPromise,
    ]);

    return sendSuccess(
      res,
      {
        ...booking,
        customer: {
          ...booking.customer,
          identificationDocumentUrl,
        },
        payments,
      },
      "Booking retrieved successfully"
    );
  }
);

// PATCH /api/admin/bookings/:id/approve — moves PENDING_VERIFICATION -> CONFIRMED  
export const approveBooking = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw ApiError.notFound("Booking not found");
    }

    if (
      booking.bookingStatus !==
      BOOKING_STATUS.PENDING_VERIFICATION
    ) {
      throw ApiError.badRequest(
        "Only bookings pending verification can be approved"
      );
    }

    const payment = booking.payments[0];

    if (!payment) {
      throw ApiError.badRequest(
        "This booking has no payment receipt"
      );
    }

    if (payment.status !== PAYMENT_STATUS.SUBMITTED) {
      throw ApiError.badRequest(
        "Payment receipt is not awaiting verification"
      );
    }

    const [updatedPayment, updatedBooking] =
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PAYMENT_STATUS.PAID,
            verifiedAt: new Date(),
          },
        }),

        prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: PAYMENT_STATUS.PAID,
            bookingStatus: BOOKING_STATUS.CONFIRMED,
          },
          include: {
            car: true,
            customer: true,
          },
        }),
      ]);

    return sendSuccess(
      res,
      {
        booking: updatedBooking,
        payment: updatedPayment,
      },
      "Payment verified and booking approved"
    );
  }
);

// PATCH /api/admin/bookings/:id/reject
export const rejectBooking = asyncHandler(
  async (req: Request, res: Response) => {
    const { reason } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw ApiError.notFound("Booking not found");
    }

    if (
      ![
        BOOKING_STATUS.PENDING_VERIFICATION,
        BOOKING_STATUS.PENDING_PAYMENT,
      ].includes(booking.bookingStatus as never)
    ) {
      throw ApiError.badRequest(
        "This booking can no longer be rejected"
      );
    }

    const payment = booking.payments[0];

    const operations = [];

    if (
      payment &&
      payment.status === PAYMENT_STATUS.SUBMITTED
    ) {
      operations.push(
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PAYMENT_STATUS.FAILED,
            verificationNote:
              reason ?? "Payment receipt rejected by admin",
          },
        })
      );
    }

    operations.push(
      prisma.booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: BOOKING_STATUS.REJECTED,
        },
        include: {
          car: true,
          customer: true,
        },
      })
    );

    const results = await prisma.$transaction(operations);

    const updatedBooking = results[results.length - 1];

    return sendSuccess(
      res,
      updatedBooking,
      "Booking rejected"
    );
  }
);

// PATCH /api/admin/bookings/:id/cancel
export const cancelBooking = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) {
      throw ApiError.notFound("Booking not found");
    }

    if (
      [
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.CANCELLED,
        BOOKING_STATUS.REJECTED,
      ].includes(booking.bookingStatus as never)
    ) {
      throw ApiError.badRequest(
        "This booking cannot be cancelled"
      );
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BOOKING_STATUS.CANCELLED,
      },
      include: {
        car: true,
        customer: true,
      },
    });

    return sendSuccess(
      res,
      updated,
      "Booking cancelled"
    );
  }
);

// PATCH /api/admin/bookings/:id/complete
export const completeBooking = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) {
      throw ApiError.notFound("Booking not found");
    }

    if (
      booking.bookingStatus !== BOOKING_STATUS.CONFIRMED
    ) {
      throw ApiError.badRequest(
        "Only confirmed bookings can be marked complete"
      );
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BOOKING_STATUS.COMPLETED,
      },
      include: {
        car: true,
        customer: true,
      },
    });

    return sendSuccess(
      res,
      updated,
      "Booking marked complete"
    );
  }
);
