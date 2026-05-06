import type { Request, Response, NextFunction } from 'express';
import { VEHICLE_TYPES, ValidationError } from '@trippulse/shared';
import type { VehicleType } from '@trippulse/shared';
import { queryCarOffers } from '../services/offer.service';

export async function getCarsOffers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobId, vehicleType, maxPrice, sortBy, limit, offset } = req.query;

    if (vehicleType !== undefined && !VEHICLE_TYPES.includes(vehicleType as VehicleType)) {
      next(new ValidationError(`Invalid vehicleType. Must be one of: ${VEHICLE_TYPES.join(', ')}`));
      return;
    }

    // Spread only defined values — required by exactOptionalPropertyTypes
    const result = await queryCarOffers({
      ...(typeof jobId === 'string' && { jobId }),
      ...(typeof vehicleType === 'string' && { vehicleType: vehicleType as VehicleType }),
      ...(typeof maxPrice === 'string' && { maxPrice: parseInt(maxPrice, 10) }),
      sortBy: sortBy === 'rentalDays' ? 'rentalDays' : 'price',
      limit: typeof limit === 'string' ? Math.min(Math.max(parseInt(limit, 10), 1), 100) : 20,
      offset: typeof offset === 'string' ? parseInt(offset, 10) : 0,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
