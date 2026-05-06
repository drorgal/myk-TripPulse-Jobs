import { PrismaClient } from '@prisma/client';

// Singleton pattern — one PrismaClient per process.
// Creating multiple clients wastes connection pool slots.
// In tests, each test file can create its own instance and disconnect after.
const prisma = new PrismaClient({
  log:
    process.env['NODE_ENV'] === 'development'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
});

export default prisma;
