/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Property` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalId]` on the table `Property` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalId]` on the table `RoomType` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Property" ADD COLUMN "externalId" TEXT;

-- AlterTable
ALTER TABLE "RoomType" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Property_name_key" ON "Property"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Property_externalId_key" ON "Property"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_externalId_key" ON "RoomType"("externalId");
