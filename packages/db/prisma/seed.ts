import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing seed data
  await prisma.carOffer.deleteMany();
  await prisma.searchJob.deleteMany();

  // Create a completed search job
  const job = await prisma.searchJob.create({
    data: {
      status: 'COMPLETED',
      params: {
        pickupLocation: 'Rome Fiumicino Airport',
        dropoffLocation: 'Rome Fiumicino Airport',
        pickupDateTime: '2026-07-01T10:00:00.000Z',
        dropoffDateTime: '2026-07-08T10:00:00.000Z',
        currency: 'EUR',
        driverAge: 30,
      },
      bullJobId: 'seed-job-1',
      providers: ['mock'],
      completedAt: new Date(),
    },
  });

  // Attach two car offers — one economy, one SUV
  await prisma.carOffer.createMany({
    data: [
      {
        searchJobId: job.id,
        providerName: 'mock',
        providerOfferId: 'mock-seed-offer-1',
        vehicleType: 'economy',
        vehicleName: 'Toyota Yaris or similar',
        vehicleClass: 'ECMR',
        priceTotal: 31500, // €315.00 for 7 days = 31500 cents
        priceCurrency: 'EUR',
        pricePerDay: 4500, // €45.00/day
        pickupLocation: 'Rome Fiumicino Airport',
        dropoffLocation: 'Rome Fiumicino Airport',
        pickupLat: 41.7999,
        pickupLng: 12.2462,
        dropoffLat: 41.7999,
        dropoffLng: 12.2462,
        pickupDateTime: new Date('2026-07-01T10:00:00.000Z'),
        dropoffDateTime: new Date('2026-07-08T10:00:00.000Z'),
        rentalDays: 7,
        hasAC: true,
        isAutomatic: false,
        seatsCount: 5,
        bagCount: 1,
        bookingUrl: 'https://example.com/book/mock-seed-offer-1',
        rawData: { source: 'seed', originalPrice: '315.00 EUR' },
      },
      {
        searchJobId: job.id,
        providerName: 'mock',
        providerOfferId: 'mock-seed-offer-2',
        vehicleType: 'suv',
        vehicleName: 'Hyundai Tucson or similar',
        vehicleClass: 'SFAR',
        priceTotal: 59500, // €595.00 for 7 days = 59500 cents
        priceCurrency: 'EUR',
        pricePerDay: 8500, // €85.00/day
        pickupLocation: 'Rome Fiumicino Airport',
        dropoffLocation: 'Rome Fiumicino Airport',
        pickupLat: 41.7999,
        pickupLng: 12.2462,
        dropoffLat: 41.7999,
        dropoffLng: 12.2462,
        pickupDateTime: new Date('2026-07-01T10:00:00.000Z'),
        dropoffDateTime: new Date('2026-07-08T10:00:00.000Z'),
        rentalDays: 7,
        hasAC: true,
        isAutomatic: true,
        seatsCount: 5,
        bagCount: 2,
        bookingUrl: 'https://example.com/book/mock-seed-offer-2',
        rawData: { source: 'seed', originalPrice: '595.00 EUR' },
      },
    ],
  });

  console.log(`Created job: ${job.id}`);
  console.log('Created 2 car offers (economy + SUV)');
  console.log('Done. Open Prisma Studio to explore: pnpm db:studio');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
