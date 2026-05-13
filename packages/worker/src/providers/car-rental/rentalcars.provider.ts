import type { CarOffer, CarSearchParams } from '@trippulse/shared';
import { createLogger } from '@trippulse/shared';
import type { CarRentalProvider } from './interface';
import type { ProviderResult } from '../shared/provider.interface';

const logger = createLogger('rentalcars-provider');

// ── Response shapes from the RentalCars / CarTrawler API ─────────────────────
// These types reflect the actual API contract. Update them once you have the
// official API docs and replace the placeholder URL in the config.

interface RentalCarsVehicle {
  vehicle_id: string;
  vehicle_name: string;
  vehicle_class: string; // SIPP code e.g. "ECMR"
  vehicle_category: string; // "Economy", "Compact", "SUV" …
  seats: number;
  bags: number | null;
  air_conditioning: boolean;
  transmission: 'manual' | 'automatic';
  price: {
    total: number; // float — we convert to cents
    per_day: number; // float — we convert to cents
    currency: string; // ISO 4217
  };
  booking_url: string;
  supplier: string;
}

interface RentalCarsSearchResponse {
  request_id: string;
  vehicles: RentalCarsVehicle[];
  errors?: string[];
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface RentalCarsProviderConfig {
  apiKey: string;
  affiliateId?: string;
  // Base URL differs between sandbox and production.
  // Sandbox: use the value from RENTALCARS_API_URL env var.
  baseUrl: string;
  timeoutMs?: number;
}

export function buildRentalCarsConfig(): RentalCarsProviderConfig {
  const apiKey = process.env['RENTALCARS_API_KEY'];
  const baseUrl = process.env['RENTALCARS_API_URL'];

  if (!apiKey || !baseUrl) {
    throw new Error(
      'RentalCars provider is not configured. ' +
        'Set RENTALCARS_API_KEY and RENTALCARS_API_URL. ' +
        'See docs/RENTALCARS_SETUP.md for instructions.',
    );
  }

  const config: RentalCarsProviderConfig = {
    apiKey,
    baseUrl,
    timeoutMs: parseInt(process.env['RENTALCARS_TIMEOUT_MS'] ?? '10000', 10),
  };

  const affiliateId = process.env['RENTALCARS_AFFILIATE_ID'];
  if (affiliateId) config.affiliateId = affiliateId;

  return config;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export class RentalCarsProvider implements CarRentalProvider {
  readonly name = 'rentalcars';
  readonly version = '2.0';

  constructor(private readonly config: RentalCarsProviderConfig) {}

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(params: CarSearchParams): Promise<ProviderResult<CarOffer>> {
    const requestBody = this.buildRequest(params);

    logger.debug({ pickupLocation: params.pickupLocation }, 'Calling RentalCars API');

    const response = await fetch(`${this.config.baseUrl}/search/cars`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 10000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`RentalCars API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as RentalCarsSearchResponse;

    const offers = data.vehicles.map((v) => this.normalize(v, params));
    const nonFatalErrors = data.errors ?? [];

    logger.debug(
      { offersCount: offers.length, errors: nonFatalErrors },
      'RentalCars API responded',
    );

    return {
      offers,
      providerName: this.name,
      rawResponseCount: data.vehicles.length,
      errors: nonFatalErrors,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.config.apiKey,
    };
    if (this.config.affiliateId) {
      headers['X-Affiliate-Id'] = this.config.affiliateId;
    }
    return headers;
  }

  private buildRequest(params: CarSearchParams): Record<string, unknown> {
    return {
      pickup_location: params.pickupLocation,
      dropoff_location: params.dropoffLocation,
      pickup_datetime: params.pickupDateTime,
      dropoff_datetime: params.dropoffDateTime,
      currency: params.currency,
      driver_age: params.driverAge,
    };
  }

  private normalize(vehicle: RentalCarsVehicle, params: CarSearchParams): CarOffer {
    const pickupDt = new Date(params.pickupDateTime);
    const dropoffDt = new Date(params.dropoffDateTime);
    const rentalDays = Math.ceil(
      (dropoffDt.getTime() - pickupDt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      id: '',
      providerName: this.name,
      providerOfferId: vehicle.vehicle_id,
      vehicleType: this.mapVehicleCategory(vehicle.vehicle_category),
      vehicleName: vehicle.vehicle_name,
      vehicleClass: vehicle.vehicle_class,
      priceTotal: Math.round(vehicle.price.total * 100),
      priceCurrency: vehicle.price.currency,
      pricePerDay: Math.round(vehicle.price.per_day * 100),
      pickupLocation: params.pickupLocation,
      dropoffLocation: params.dropoffLocation,
      pickupDateTime: params.pickupDateTime,
      dropoffDateTime: params.dropoffDateTime,
      rentalDays,
      hasAC: vehicle.air_conditioning,
      isAutomatic: vehicle.transmission === 'automatic',
      seatsCount: vehicle.seats,
      bagCount: vehicle.bags ?? undefined,
      bookingUrl: vehicle.booking_url,
    };
  }

  private mapVehicleCategory(category: string): CarOffer['vehicleType'] {
    const map: Record<string, CarOffer['vehicleType']> = {
      economy: 'economy',
      compact: 'compact',
      midsize: 'midsize',
      intermediate: 'midsize',
      fullsize: 'midsize',
      suv: 'suv',
      van: 'van',
      minivan: 'van',
      luxury: 'luxury',
      premium: 'luxury',
    };
    return map[category.toLowerCase()] ?? 'economy';
  }
}
