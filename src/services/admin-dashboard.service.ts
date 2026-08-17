import { prisma } from "../config/prisma";
import { BOOKING_STATUS } from "../constants";

export async function getAdminDashboard() {
  const now = new Date();

  /**
   * Start and end of today.
   *
   * This uses the server's local date.
   * If your application standardizes everything to a specific
   * timezone, use your existing timezone utility here instead.
   */
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  /**
   * Run independent queries in parallel.
   */
  const [
    cars,
    currentlyRented,
    maintenanceCars,
    pickupsToday,
    returnsToday,
    pendingVerification,
  ] = await Promise.all([
    /**
     * Get fleet information.
     */
    prisma.car.findMany({
      select: {
        id: true,
        name: true,
        quantity: true,
        status: true,
      },
    }),

    /**
     * Cars currently being rented.
     *
     * A booking is active right now when:
     *
     * pickupDate <= now
     * returnDate > now
     * status = CONFIRMED
     */
    prisma.booking.findMany({
      where: {
        bookingStatus: BOOKING_STATUS.CONFIRMED,
        pickupDate: {
          lte: now,
        },
        returnDate: {
          gt: now,
        },
      },
      include: {
        car: true,
        customer: true,
      },
    }),

    /**
     * Cars marked as maintenance.
     */
    prisma.car.findMany({
      where: {
        status: "MAINTENANCE",
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        status: true,
      },
    }),

    /**
     * Cars being picked up today.
     */
    prisma.booking.findMany({
      where: {
        bookingStatus: BOOKING_STATUS.CONFIRMED,
        pickupDate: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      include: {
        car: true,
        customer: true,
      },
      orderBy: {
        pickupDate: "asc",
      },
    }),

    /**
     * Cars being returned today.
     */
    prisma.booking.findMany({
      where: {
        bookingStatus: BOOKING_STATUS.CONFIRMED,
        returnDate: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      include: {
        car: true,
        customer: true,
      },
      orderBy: {
        returnDate: "asc",
      },
    }),

    /**
     * Bookings waiting for admin verification.
     */
    prisma.booking.findMany({
      where: {
        bookingStatus:
          BOOKING_STATUS.PENDING_VERIFICATION,
      },
      include: {
        car: true,
        customer: true,
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  /**
   * Total number of physical cars.
   *
   * If your `Car` model uses quantity to represent
   * multiple units of the same model, sum quantity.
   */
  const totalCars = cars.reduce(
    (total, car) => total + car.quantity,
    0
  );

  /**
   * Number of cars currently rented.
   */
  const rentedCars = currentlyRented.reduce(
    (total, booking) => total + booking.car.quantity,
    0
  );

  /**
   * Number of cars under maintenance.
   */
  const maintenanceCount = maintenanceCars.reduce(
    (total, car) => total + car.quantity,
    0
  );

  /**
   * This is the basic fleet-level availability.
   *
   * NOTE:
   * If one Car row represents multiple physical vehicles,
   * this gives a fleet-level estimate. For exact unit-level
   * availability, individual Vehicle records would be better.
   */
  const availableCars = Math.max(
    totalCars - rentedCars - maintenanceCount,
    0
  );

  return {
    summary: {
      totalCars,
      availableCars,
      currentlyRented: rentedCars,
      maintenance: maintenanceCount,
    },

    today: {
      pickups: pickupsToday.length,
      returns: returnsToday.length,
    },

    pendingVerification: {
      count: pendingVerification.length,
      bookings: pendingVerification,
    },

    currentlyRentedBookings: currentlyRented,

    maintenanceCars,

    pickupsToday,

    returnsToday,
  };
}