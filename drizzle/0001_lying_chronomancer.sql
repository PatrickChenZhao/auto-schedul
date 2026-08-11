ALTER TABLE "schedules" ADD COLUMN "revision" integer;--> statement-breakpoint
WITH ranked_schedules AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "workspace_id", "week_start"
      ORDER BY "created_at", "id"
    ) AS "revision"
  FROM "schedules"
)
UPDATE "schedules"
SET "revision" = ranked_schedules."revision"
FROM ranked_schedules
WHERE "schedules"."id" = ranked_schedules."id";--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "revision" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "revision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_workspace_week_revision_uidx" ON "schedules" USING btree ("workspace_id","week_start","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_workspace_idempotency_uidx" ON "schedules" USING btree ("workspace_id","idempotency_key");
