-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "link" TEXT,
ALTER COLUMN "donationId" DROP NOT NULL,
ALTER COLUMN "action" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APROVADO',
ADD COLUMN     "approvedAt" TIMESTAMP(3);
