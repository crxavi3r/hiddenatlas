-- CreateTable: Trip (AI-generated trips saved by a user)
CREATE TABLE "Trip" (
    "id"          TEXT      NOT NULL,
    "userId"      TEXT      NOT NULL,
    "title"       TEXT      NOT NULL,
    "destination" TEXT      NOT NULL,
    "country"     TEXT      NOT NULL DEFAULT '',
    "duration"    TEXT      NOT NULL DEFAULT '',
    "overview"    TEXT      NOT NULL DEFAULT '',
    "highlights"  JSONB     NOT NULL DEFAULT '[]',
    "hotels"      JSONB     NOT NULL DEFAULT '[]',
    "experiences" JSONB     NOT NULL DEFAULT '[]',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TripDay (one row per day of a Trip)
CREATE TABLE "TripDay" (
    "id"          TEXT    NOT NULL,
    "tripId"      TEXT    NOT NULL,
    "dayNumber"   INTEGER NOT NULL,
    "title"       TEXT    NOT NULL DEFAULT '',
    "description" TEXT    NOT NULL DEFAULT '',

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TripEvent (immutable audit log — tripId has no FK intentionally)
CREATE TABLE "TripEvent" (
    "id"        TEXT      NOT NULL,
    "userId"    TEXT      NOT NULL,
    "tripId"    TEXT,
    "eventType" TEXT      NOT NULL,
    "metadata"  JSONB     NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_userId_idx"         ON "Trip"("userId");
CREATE INDEX "TripDay_tripId_idx"       ON "TripDay"("tripId");
CREATE INDEX "TripEvent_userId_idx"     ON "TripEvent"("userId");
CREATE INDEX "TripEvent_tripId_idx"     ON "TripEvent"("tripId");
CREATE INDEX "TripEvent_eventType_idx"  ON "TripEvent"("eventType");
CREATE INDEX "TripEvent_createdAt_idx"  ON "TripEvent"("createdAt");

-- AddForeignKey: Trip → User
ALTER TABLE "Trip"
    ADD CONSTRAINT "Trip_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: TripDay → Trip (cascade delete)
ALTER TABLE "TripDay"
    ADD CONSTRAINT "TripDay_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TripEvent → User (no FK on tripId — by design)
ALTER TABLE "TripEvent"
    ADD CONSTRAINT "TripEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
