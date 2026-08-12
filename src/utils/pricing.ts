const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Number of rental days between pickup and return, inclusive of partial days.
 * Minimum of 1 day, per the MVP spec's simple daily-rate model.
 */
export function calculateRentalDays(pickupDate: Date, returnDate: Date): number {
  const diffMs = returnDate.getTime() - pickupDate.getTime();
  const days = Math.ceil(diffMs / MS_PER_DAY);
  return Math.max(days, 1);
}

export function calculateTotalAmount(
  pickupDate: Date,
  returnDate: Date,
  pricePerDay: number
): number {
  const days = calculateRentalDays(pickupDate, returnDate);
  return days * pricePerDay;
}
