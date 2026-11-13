-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('OFERTA', 'COLETA', 'ENTREGA');

-- CreateTable
CREATE TABLE "donation_photos" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "kind" "PhotoKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" TEXT,
    "uploadedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_route_access" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_route_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donation_photos_storageKey_key" ON "donation_photos"("storageKey");

-- CreateIndex
CREATE INDEX "donation_photos_donationId_kind_idx" ON "donation_photos"("donationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_route_access_tokenHash_key" ON "pickup_route_access"("tokenHash");

-- CreateIndex
CREATE INDEX "pickup_route_access_routeId_idx" ON "pickup_route_access"("routeId");

-- AddForeignKey
ALTER TABLE "donation_photos" ADD CONSTRAINT "donation_photos_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_route_access" ADD CONSTRAINT "pickup_route_access_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "pickup_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
