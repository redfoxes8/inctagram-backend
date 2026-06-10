/*
  Warnings:

  - Made the column `extension` on table `files` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "files" ALTER COLUMN "extension" SET NOT NULL;
