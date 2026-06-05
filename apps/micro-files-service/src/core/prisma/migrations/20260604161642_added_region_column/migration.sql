/*
  Warnings:

  - Added the required column `file_extension` to the `files` table without a default value. This is not possible if the table is not empty.
  - Added the required column `region` to the `files` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `file_type` on the `files` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('AVATAR', 'POST_IMAGE', 'DOCUMENT', 'MEDIA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FileStatus" ADD VALUE 'DELETING';
ALTER TYPE "FileStatus" ADD VALUE 'FAILED_DELETE';

-- DropIndex
DROP INDEX "files_file_type_idx";

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "file_extension" TEXT NOT NULL,
ADD COLUMN     "region" TEXT NOT NULL,
DROP COLUMN "file_type",
ADD COLUMN     "file_type" "FileType" NOT NULL;

-- CreateIndex
CREATE INDEX "files_file_extension_idx" ON "files"("file_extension");
