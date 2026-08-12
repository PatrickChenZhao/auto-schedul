import { z } from "zod";
import type { AppSettings, EmployeeStats, WeeklySchedule } from "../types";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const daySchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);
const shiftTypeSchema = z.enum(["early", "mid", "late"]);

const employeeSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().trim().min(1).max(200),
  type: z.enum(["full-time", "casual"]),
  enabled: z.boolean(),
});

const availabilityEntrySchema = z.object({
  available: z.boolean(),
  start: timeSchema,
  end: timeSchema,
});

const employeePreferenceSchema = z.object({
  shiftPreference: z.enum(["early", "mid", "late", "any"]),
  refuseLateShift: z.boolean(),
  minDays: z.number().int().min(0).max(7),
  maxDays: z.number().int().min(0).max(7),
  coworkers: z.array(
    z.object({
      coworkerId: z.string().min(1).max(160),
      type: z.enum(["hard", "soft"]),
    }),
  ),
});

const dayRecord = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    Monday: value,
    Tuesday: value,
    Wednesday: value,
    Thursday: value,
    Friday: value,
    Saturday: value,
    Sunday: value,
  });

const shiftRecord = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ early: value, mid: value, late: value });

export const appSettingsSchema = z
  .object({
    employees: z.array(employeeSchema).max(500),
    availability: z.record(z.string(), dayRecord(availabilityEntrySchema)),
    preferences: z.record(z.string(), employeePreferenceSchema),
    shiftDemand: dayRecord(shiftRecord(z.number().int().min(0).max(100))),
    shiftTemplates: dayRecord(
      shiftRecord(z.object({ start: timeSchema, end: timeSchema })),
    ),
    specialSettings: z.object({
      earlyAllowedEmployeeIds: z.array(z.string().min(1).max(160)),
      priorityMode: z.enum(["balance-first", "binding-first", "work-day-first"]),
      shiftTypeCapEnabled: z.boolean(),
    }),
  })
  .superRefine((settings, context) => {
    const employeeIds = new Set(settings.employees.map((employee) => employee.id));
    if (employeeIds.size !== settings.employees.length) {
      context.addIssue({ code: "custom", message: "Employee IDs must be unique." });
    }
    for (const employee of settings.employees) {
      if (!settings.availability[employee.id] || !settings.preferences[employee.id]) {
        context.addIssue({
          code: "custom",
          message: `Availability and preferences are required for ${employee.id}.`,
        });
      }
    }
  });

const assignmentSchema = z.object({
  employeeId: z.string().min(1).max(160),
  shiftType: shiftTypeSchema,
});

export const weeklyScheduleSchema = dayRecord(z.array(assignmentSchema).max(500));

export const saveConfigurationRequestSchema = z.object({
  settings: appSettingsSchema,
  source: z.enum(["autosave", "local-storage-import", "new-workspace"]),
  sourceFingerprint: z.string().min(1).max(256).optional(),
});

export const createHistoryRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  weekStart: dateSchema,
  format: z.enum(["general", "chapanda"]),
  schedule: weeklyScheduleSchema,
  settingsSnapshot: appSettingsSchema,
});

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
};

export type BootstrapResponse = {
  workspace: WorkspaceSummary;
  configuration: null | {
    settings: AppSettings;
    revision: number;
    updatedAt: string;
  };
};

export type SaveConfigurationResponse = {
  revision: number;
  updatedAt: string;
};

export const HISTORY_RETENTION_LIMIT = 100;

export type HistoryListItem = {
  id: string;
  weekStart: string;
  weekEnd: string;
  format: "general" | "chapanda";
  revision: number;
  createdAt: string;
  createdBy: string;
  assignmentCount: number;
};

export type HistoryAssignment = {
  employeeId: string;
  employeeName: string;
  workDate: string;
  day: z.infer<typeof daySchema>;
  shiftType: z.infer<typeof shiftTypeSchema>;
  startTime: string;
  endTime: string;
  calculatedHours: number;
};

export type HistoryDetail = HistoryListItem & {
  scheduleSnapshot: {
    schedule: WeeklySchedule;
    employeeNames: Record<string, string>;
  };
  settingsSnapshot: AppSettings;
  assignments: HistoryAssignment[];
  stats: EmployeeStats[];
};

export const toAppSettings = (state: AppSettings): AppSettings => ({
  employees: state.employees,
  availability: state.availability,
  preferences: state.preferences,
  shiftDemand: state.shiftDemand,
  shiftTemplates: state.shiftTemplates,
  specialSettings: state.specialSettings,
});
