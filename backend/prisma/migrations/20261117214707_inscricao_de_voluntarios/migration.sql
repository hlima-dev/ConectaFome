-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');

-- CreateTable
CREATE TABLE "volunteer_applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT NOT NULL,
    "availability" TEXT[],
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDENTE',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "volunteerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_applications_volunteerId_key" ON "volunteer_applications"("volunteerId");

-- CreateIndex
CREATE INDEX "volunteer_applications_status_createdAt_idx" ON "volunteer_applications"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "volunteer_applications" ADD CONSTRAINT "volunteer_applications_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "volunteers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
