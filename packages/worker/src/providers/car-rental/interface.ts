import type { CarOffer, CarSearchParams } from '@trippulse/shared';
import type { TravelProvider } from '../shared/provider.interface';

// Concrete type alias — binds the generic to the car rental domain.
// All car rental provider implementations must satisfy this type.
export type CarRentalProvider = TravelProvider<CarSearchParams, CarOffer>;
