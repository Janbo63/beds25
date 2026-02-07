-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoomType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" REAL NOT NULL,
    "capacity" INTEGER NOT NULL,
    "maxAdults" INTEGER NOT NULL DEFAULT 2,
    "maxChildren" INTEGER NOT NULL DEFAULT 0,
    "size" REAL,
    "bedConfig" TEXT,
    "amenities" TEXT,
    "propertyId" TEXT NOT NULL,
    CONSTRAINT "RoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RoomType" ("basePrice", "capacity", "description", "id", "name", "propertyId") SELECT "basePrice", "capacity", "description", "id", "name", "propertyId" FROM "RoomType";
DROP TABLE "RoomType";
ALTER TABLE "new_RoomType" RENAME TO "RoomType";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
