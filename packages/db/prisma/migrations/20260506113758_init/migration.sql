-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "SearchJob" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "params" JSONB NOT NULL,
    "bullJobId" TEXT,
    "providers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarOffer" (
    "id" TEXT NOT NULL,
    "searchJobId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerOfferId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "vehicleName" TEXT NOT NULL,
    "vehicleClass" TEXT NOT NULL DEFAULT '',
    "priceTotal" INTEGER NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "pricePerDay" INTEGER NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "dropoffLocation" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "dropoffLat" DOUBLE PRECISION,
    "dropoffLng" DOUBLE PRECISION,
    "pickupDateTime" TIMESTAMP(3) NOT NULL,
    "dropoffDateTime" TIMESTAMP(3) NOT NULL,
    "rentalDays" INTEGER NOT NULL,
    "hasAC" BOOLEAN NOT NULL DEFAULT true,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT true,
    "seatsCount" INTEGER,
    "bagCount" INTEGER,
    "bookingUrl" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchJob_bullJobId_key" ON "SearchJob"("bullJobId");

-- CreateIndex
CREATE INDEX "SearchJob_status_idx" ON "SearchJob"("status");

-- CreateIndex
CREATE INDEX "SearchJob_createdAt_idx" ON "SearchJob"("createdAt");

-- CreateIndex
CREATE INDEX "CarOffer_searchJobId_idx" ON "CarOffer"("searchJobId");

-- CreateIndex
CREATE INDEX "CarOffer_priceTotal_idx" ON "CarOffer"("priceTotal");

-- CreateIndex
CREATE INDEX "CarOffer_vehicleType_idx" ON "CarOffer"("vehicleType");

-- CreateIndex
CREATE UNIQUE INDEX "CarOffer_searchJobId_providerName_providerOfferId_key" ON "CarOffer"("searchJobId", "providerName", "providerOfferId");

-- AddForeignKey
ALTER TABLE "CarOffer" ADD CONSTRAINT "CarOffer_searchJobId_fkey" FOREIGN KEY ("searchJobId") REFERENCES "SearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
