CREATE TYPE "public"."coworker_preference_type" AS ENUM('hard', 'soft');--> statement-breakpoint
CREATE TYPE "public"."employee_type" AS ENUM('full-time', 'casual');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('general', 'chapanda');--> statement-breakpoint
CREATE TYPE "public"."history_trigger" AS ENUM('excel-export');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."shift_preference" AS ENUM('early', 'mid', 'late', 'any');--> statement-breakpoint
CREATE TYPE "public"."shift_type" AS ENUM('early', 'mid', 'late');--> statement-breakpoint
CREATE TYPE "public"."weekday" AS ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "employee_availability" (
	"workspace_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"day" "weekday" NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"start_time" time(0) NOT NULL,
	"end_time" time(0) NOT NULL,
	CONSTRAINT "employee_availability_workspace_id_employee_id_day_pk" PRIMARY KEY("workspace_id","employee_id","day")
);
--> statement-breakpoint
CREATE TABLE "employee_coworker_preferences" (
	"workspace_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"coworker_id" text NOT NULL,
	"type" "coworker_preference_type" NOT NULL,
	CONSTRAINT "employee_coworker_preferences_workspace_id_employee_id_coworker_id_pk" PRIMARY KEY("workspace_id","employee_id","coworker_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"type" "employee_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"preferred_shift" "shift_preference" DEFAULT 'any' NOT NULL,
	"refuse_late_shift" boolean DEFAULT false NOT NULL,
	"min_days" integer DEFAULT 0 NOT NULL,
	"max_days" integer DEFAULT 6 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "roster_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"shift_demand" jsonb NOT NULL,
	"shift_templates" jsonb NOT NULL,
	"special_settings" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name_snapshot" text NOT NULL,
	"work_date" date NOT NULL,
	"shift_type" "shift_type" NOT NULL,
	"start_time" time(0) NOT NULL,
	"end_time" time(0) NOT NULL,
	"calculated_hours" numeric(6, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"schedule_snapshot" jsonb NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"history_trigger" "history_trigger" DEFAULT 'excel-export' NOT NULL,
	"export_format" "export_format" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"imported_by" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"status" "import_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'viewer' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"personal_owner_user_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_employee_fk" FOREIGN KEY ("workspace_id","employee_id") REFERENCES "public"."employees"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_coworker_preferences" ADD CONSTRAINT "coworker_preferences_employee_fk" FOREIGN KEY ("workspace_id","employee_id") REFERENCES "public"."employees"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_coworker_preferences" ADD CONSTRAINT "coworker_preferences_coworker_fk" FOREIGN KEY ("workspace_id","coworker_id") REFERENCES "public"."employees"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_settings" ADD CONSTRAINT "roster_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_employee_fk" FOREIGN KEY ("workspace_id","employee_id") REFERENCES "public"."employees"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_schedule_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_imports" ADD CONSTRAINT "workspace_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_workspace_active_idx" ON "employees" USING btree ("workspace_id","deleted_at","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_assignments_schedule_employee_date_uidx" ON "schedule_assignments" USING btree ("schedule_id","employee_id","work_date");--> statement-breakpoint
CREATE INDEX "schedule_assignments_schedule_idx" ON "schedule_assignments" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "schedules_workspace_week_idx" ON "schedules" USING btree ("workspace_id","week_start","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_imports_fingerprint_uidx" ON "workspace_imports" USING btree ("workspace_id","source_fingerprint");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_personal_owner_uidx" ON "workspaces" USING btree ("personal_owner_user_id");