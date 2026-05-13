import type { CarRentalProvider } from './interface';
import { MockCarRentalProvider } from './mock.provider';
import { RentalCarsProvider, buildRentalCarsConfig } from './rentalcars.provider';
import { createLogger } from '@trippulse/shared';

const logger = createLogger('provider-registry');

function tryBuildRentalCars(): CarRentalProvider | null {
  try {
    return new RentalCarsProvider(buildRentalCarsConfig());
  } catch {
    logger.warn(
      'RENTALCARS_API_KEY or RENTALCARS_API_URL not set — provider disabled. See docs/RENTALCARS_SETUP.md',
    );
    return null;
  }
}

// Registry: maps provider name → instance.
// To add a new provider: implement CarRentalProvider, add it here.
// The processor and worker never need to change.
const rentalCars = tryBuildRentalCars();

const providers: Record<string, CarRentalProvider> = {
  mock: new MockCarRentalProvider(),
  ...(rentalCars ? { rentalcars: rentalCars } : {}),
  // enterprise: new EnterpriseProvider(),  // Phase 7
};

export function getCarRentalProviders(names?: string[]): CarRentalProvider[] {
  if (!names || names.length === 0) {
    return Object.values(providers);
  }
  return names.map((name) => {
    const provider = providers[name];
    if (!provider) {
      throw new Error(
        `Unknown car rental provider: "${name}". Available: ${Object.keys(providers).join(', ')}`,
      );
    }
    return provider;
  });
}

export function getRegisteredProviderNames(): string[] {
  return Object.keys(providers);
}
