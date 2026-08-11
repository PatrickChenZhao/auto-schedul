import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AppSettings,
  ShiftDemand,
  ShiftTemplateMap,
  SpecialSettings,
  WeeklySchedule,
} from "../../src/types";

export const workspaceRole = pgEnum("workspace_role", ["owner", "editor", "viewer"]);
export const employeeType = pgEnum("employee_type", ["full-time", "casual"]);
export const shiftPreference = pgEnum("shift_preference", ["early", "mid", "late", "any"]);
export const coworkerPreferenceType = pgEnum("coworker_preference_type", ["hard", "soft"]);
export const weekday = pgEnum("weekday", [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);
export const shiftType = pgEnum("shift_type", ["early", "mid", "late"]);
export const exportFormat = pgEnum("export_format", ["general", "chapanda"]);
export const historyTrigger = pgEnum("history_trigger", ["excel-export"]);
export const importStatus = pgEnum("import_status", ["completed", "failed"]);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    personalOwnerUserId: text("personal_owner_user_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workspaces_personal_owner_uidx").on(table.personalOwnerUserId)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: workspaceRole("role").notNull().default("viewer"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_idx").on(table.userId),
  ],
);

export const employees = pgTable(
  "employees",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    type: employeeType("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    preferredShift: shiftPreference("preferred_shift").notNull().default("any"),
    refuseLateShift: boolean("refuse_late_shift").notNull().default(false),
    minDays: integer("min_days").notNull().default(0),
    maxDays: integer("max_days").notNull().default(6),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("employees_workspace_active_idx").on(table.workspaceId, table.deletedAt, table.sortOrder),
  ],
);

export const employeeAvailability = pgTable(
  "employee_availability",
  {
    workspaceId: uuid("workspace_id").notNull(),
    employeeId: text("employee_id").notNull(),
    day: weekday("day").notNull(),
    available: boolean("available").notNull().default(true),
    startTime: time("start_time", { precision: 0 }).notNull(),
    endTime: time("end_time", { precision: 0 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.employeeId, table.day] }),
    foreignKey({
      columns: [table.workspaceId, table.employeeId],
      foreignColumns: [employees.workspaceId, employees.id],
      name: "employee_availability_employee_fk",
    }).onDelete("cascade"),
  ],
);

export const employeeCoworkerPreferences = pgTable(
  "employee_coworker_preferences",
  {
    workspaceId: uuid("workspace_id").notNull(),
    employeeId: text("employee_id").notNull(),
    coworkerId: text("coworker_id").notNull(),
    type: coworkerPreferenceType("type").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.employeeId, table.coworkerId] }),
    foreignKey({
      columns: [table.workspaceId, table.employeeId],
      foreignColumns: [employees.workspaceId, employees.id],
      name: "coworker_preferences_employee_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.coworkerId],
      foreignColumns: [employees.workspaceId, employees.id],
      name: "coworker_preferences_coworker_fk",
    }).onDelete("cascade"),
  ],
);

export const rosterSettings = pgTable("roster_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  shiftDemand: jsonb("shift_demand").$type<ShiftDemand>().notNull(),
  shiftTemplates: jsonb("shift_templates").$type<ShiftTemplateMap>().notNull(),
  specialSettings: jsonb("special_settings").$type<SpecialSettings>().notNull(),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduleSnapshot = {
  schedule: WeeklySchedule;
  employeeNames: Record<string, string>;
};

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    scheduleSnapshot: jsonb("schedule_snapshot").$type<ScheduleSnapshot>().notNull(),
    settingsSnapshot: jsonb("settings_snapshot").$type<AppSettings>().notNull(),
    trigger: historyTrigger("history_trigger").notNull().default("excel-export"),
    format: exportFormat("export_format").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (table) => [index("schedules_workspace_week_idx").on(table.workspaceId, table.weekStart, table.createdAt)],
);

export const scheduleAssignments = pgTable(
  "schedule_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    scheduleId: uuid("schedule_id").notNull(),
    employeeId: text("employee_id").notNull(),
    employeeName: text("employee_name_snapshot").notNull(),
    workDate: date("work_date").notNull(),
    shiftType: shiftType("shift_type").notNull(),
    startTime: time("start_time", { precision: 0 }).notNull(),
    endTime: time("end_time", { precision: 0 }).notNull(),
    calculatedHours: numeric("calculated_hours", { precision: 6, scale: 2, mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("schedule_assignments_schedule_employee_date_uidx").on(
      table.scheduleId,
      table.employeeId,
      table.workDate,
    ),
    index("schedule_assignments_schedule_idx").on(table.scheduleId),
    foreignKey({
      columns: [table.workspaceId, table.employeeId],
      foreignColumns: [employees.workspaceId, employees.id],
      name: "schedule_assignments_employee_fk",
    }),
    foreignKey({
      columns: [table.scheduleId],
      foreignColumns: [schedules.id],
      name: "schedule_assignments_schedule_fk",
    }).onDelete("cascade"),
  ],
);

export const workspaceImports = pgTable(
  "workspace_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    importedBy: text("imported_by").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    status: importStatus("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_imports_fingerprint_uidx").on(
      table.workspaceId,
      table.sourceFingerprint,
    ),
  ],
);
