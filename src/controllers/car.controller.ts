import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ACTIVE_BOOKING_STATUSES, CAR_STATUS } from "../constants";
import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * How many units of this car are already booked for an overlapping date range.
 * Overlap rule: existing.pickup < newReturn AND existing.return > newPickup.
 */
async function countOverlappingBookings(carId: string, pickupDate: Date, returnDate: Date) {
  return prisma.booking.count({
    where: {
      carId,
      bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
      pickupDate: { lt: returnDate },
      returnDate: { gt: pickupDate },
    },
  });
}

// GET /api/cars — public listing, optionally filtered by availability window
export const listCars = asyncHandler(async (req: Request, res: Response) => {
  const { pickupDate, returnDate } = req.query as { pickupDate?: string; returnDate?: string };

  const cars = await prisma.car.findMany({
    where: { status: CAR_STATUS.AVAILABLE },
    orderBy: { createdAt: "desc" },
  });

  if (!pickupDate || !returnDate) {
    return sendSuccess(res, cars);
  }

  const pickup = new Date(pickupDate);
  const ret = new Date(returnDate);

  const withAvailability = await Promise.all(
    cars.map(async (car) => {
      const booked = await countOverlappingBookings(car.id, pickup, ret);
      const availableUnits = Math.max(car.quantity - booked, 0);
      return { ...car, availableUnits };
    })
  );

  return sendSuccess(res, withAvailability.filter((c) => c.availableUnits > 0));
});

// GET /api/cars/:id — public single car detail
export const getCar = asyncHandler(async (req: Request, res: Response) => {
  const car = await prisma.car.findUnique({ where: { id: req.params.id } });
  if (!car) throw ApiError.notFound("Car not found");
  return sendSuccess(res, car);
});

// GET /api/admin/cars — admin listing (all statuses)
export const adminListCars = asyncHandler(async (_req: Request, res: Response) => {
  const cars = await prisma.car.findMany({ orderBy: { createdAt: "desc" } });
  return sendSuccess(res, cars);
});

// POST /api/admin/cars
export const createCar = asyncHandler(async (req: Request, res: Response) => {
  const car = await prisma.car.create({ data: req.body });
  return sendSuccess(res, car, "Car created", 201);
});

// PATCH /api/admin/cars/:id
export const updateCar = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.car.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Car not found");

  const car = await prisma.car.update({
    where: { id: req.params.id },
    data: req.body,
  });
  return sendSuccess(res, car, "Car updated");
});

// DELETE /api/admin/cars/:id
export const deleteCar = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.car.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound("Car not found");

  const activeBookings = await prisma.booking.count({
    where: { carId: req.params.id, bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] } },
  });
  if (activeBookings > 0) {
    throw ApiError.conflict(
      "Cannot delete a car with active bookings. Mark it UNAVAILABLE instead."
    );
  }

  await prisma.car.delete({ where: { id: req.params.id } });
  return sendSuccess(res, null, "Car deleted");
});

export const _internal = { countOverlappingBookings };
