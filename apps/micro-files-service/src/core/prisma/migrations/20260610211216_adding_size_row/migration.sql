/*
  Warnings:

  - You are about to drop the column `file_extension` on the `files` table. All the data in the column will be lost.
  - You are about to drop the column `file_type` on the `files` table. All the data in the column will be lost.
  - Added the required column `extension` to the `files` table without a default value. This is not possible if the table is not empty.
  - Added the required column `size` to the `files` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `files` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "files_file_extension_idx";

-- AlterTable
ALTER TABLE "files" DROP COLUMN "file_extension",
DROP COLUMN "file_type",
ADD COLUMN     "extension" TEXT,
ADD COLUMN     "size" INTEGER NOT NULL,
ADD COLUMN     "type" "FileType" NOT NULL;

-- CreateIndex
CREATE INDEX "files_extension_idx" ON "files"("extension");
