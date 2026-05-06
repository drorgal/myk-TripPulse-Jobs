import type { CarRentalProvider } from './interface';
import { MockCarRentalProvider } from './mock.provider';

// Registry: maps provider name → instance.
// To add a new provider: implement CarRentalProvider, add it here.
// The processor and worker never need to change.
const providers: Record<string, CarRentalProvider> = {
  mock: new MockCarRentalProvider(),
  // rentalcars: new RentalCarsProvider(),  // Phase 6
  // enterprise: new EnterpriseProvider(),  // Phase 6
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
