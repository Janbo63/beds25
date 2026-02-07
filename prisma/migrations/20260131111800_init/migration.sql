-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" REAL NOT NULL,
    "capacity" INTEGER NOT NULL,
    "propertyId" TEXT NOT NULL,
    CONSTRAINT "RoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT,
    "name" TEXT,
    "roomTypeId" TEXT NOT NULL,
    CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "checkIn" DATETIME NOT NULL,
    "checkOut" DATETIME NOT NULL,
    "totalPrice" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomTypeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "minStay" INTEGER DEFAULT 1,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PriceRule_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IcalSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "lastSynced" DATETIME,
    CONSTRAINT "IcalSync_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceRule_roomTypeId_date_key" ON "PriceRule"("roomTypeId", "date");
