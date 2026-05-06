import { z } from 'zod';

export const CarSearchParamsSchema = z.object({
  // Optional link back to a trip in myk-trip-plan
  tripId: z.string().optional(),
  pickupLocation: z.string().min(2).max(200),
  dropoffLocation: z.string().min(2).max(200),
  // ISO 8601 strings over the wire — converted to Date in the DB layer
  pickupDateTime: z.string().datetime(),
  dropoffDateTime: z.string().datetime(),
  currency: z.string().length(3).default('USD'),
  driverAge: z.number().int().min(18).max(99).default(30),
  // Override which providers to use — omit to use all registered providers
  providers: z.array(z.string()).optional(),
});

export type CarSearchParams = z.infer<typeof CarSearchParamsSchema>;
