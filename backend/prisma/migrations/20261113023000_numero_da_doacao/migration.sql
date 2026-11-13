-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "donations_number_key" ON "donations"("number");
