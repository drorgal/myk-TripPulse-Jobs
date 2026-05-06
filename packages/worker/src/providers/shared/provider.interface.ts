// Generic provider contract — the T generics let this scale to hotels/flights
// without changing the interface at all.
//
// Future examples:
//   type HotelProvider  = TravelProvider<HotelSearchParams,  HotelOffer>
//   type FlightProvider = TravelProvider<FlightSearchParams, FlightOffer>

export interface ProviderResult<TNormalized> {
  offers: TNormalized[];
  providerName: string;
  // How many raw results the provider returned before normalization.
  // Useful for debugging: if rawResponseCount > offers.length, some were filtered.
  rawResponseCount: number;
  errors: string[]; // Non-fatal errors — partial results may still be usable
}

export interface TravelProvider<TSearchParams, TNormalized> {
  readonly name: string; // Unique identifier: "mock", "rentalcars", "enterprise"
  readonly version: string; // API version this implementation targets

  // Returns normalized results — the provider is responsible for translating
  // its own response format into the canonical TNormalized shape.
  search(params: TSearchParams): Promise<ProviderResult<TNormalized>>;

  // Health check — verifies the provider is reachable.
  // Called on startup and by the /health endpoint.
  ping(): Promise<boolean>;
}
