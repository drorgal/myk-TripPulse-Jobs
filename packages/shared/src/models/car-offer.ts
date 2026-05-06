import { z } from 'zod';

export const VEHICLE_TYPES = ['economy', 'compact', 'midsize', 'suv', 'van', 'luxury'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const CarOfferSchema = z.object({
  id: z.string(),
  providerName: z.string(),
  providerOfferId: z.string(),
  vehicleType: z.enum(VEHICLE_TYPES),
  vehicleName: z.string(),
  vehicleClass: z.string().default(''),
  // Prices always in cents — $45.00 = 4500. Never use Float for money.
  priceTotal: z.number().int().positive(),
  priceCurrency: z.string().length(3),
  pricePerDay: z.number().int().positive(),
  pickupLocation: z.string(),
  dropoffLocation: z.string(),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
  pickupDateTime: z.string().datetime(),
  dropoffDateTime: z.string().datetime(),
  rentalDays: z.number().int().positive(),
  hasAC: z.boolean().default(true),
  isAutomatic: z.boolean().default(true),
  seatsCount: z.number().int().optional(),
  bagCount: z.number().int().optional(),
  bookingUrl: z.string().url().optional(),
});

export type CarOffer = z.infer<typeof CarOfferSchema>;
