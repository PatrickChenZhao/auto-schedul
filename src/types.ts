export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const shiftTypes = ["early", "mid", "late"] as const;

export type Day = (typeof days)[number];
export type ShiftType = (typeof shiftTypes)[number];
export type EmployeeType = "full-time" | "casual";
export type ShiftPreference = ShiftType | "any";
export type CoworkerPreferenceType = "hard" | "soft";
export type PriorityMode = "balance-first" | "binding-first" | "work-day-first";

export type Employee = {
  id: string;
  name: string;
  type: EmployeeType;
  enabled: boolean;
};

export type AvailabilityEntry = {
  available: boolean;
  start: string;
  end: string;
};

export type AvailabilityMap = Record<string, Record<Day, AvailabilityEntry>>;

export type CoworkerPreference = {
  coworkerId: string;
  type: CoworkerPreferenceType;
};

export type EmployeePreference = {
  shiftPreference: ShiftPreference;
  refuseLateShift: boolean;
  minDays: number;
  maxDays: number;
  coworkers: CoworkerPreference[];
};

export type PreferenceMap = Record<string, EmployeePreference>;

export type ShiftDemand = Record<Day, Record<ShiftType, number>>;

export type ShiftTemplate = {
  start: string;
  end: string;
};

export type ShiftTemplateMap = Record<Day, Record<ShiftType, ShiftTemplate>>;

export type SpecialSettings = {
  earlyAllowedEmployeeIds: string[];
  priorityMode: PriorityMode;
  shiftTypeCapEnabled: boolean;
};

export type ShiftAssignment = {
  employeeId: string;
  shiftType: ShiftType;
};

export type WeeklySchedule = Record<Day, ShiftAssignment[]>;

export type AppState = {
  employees: Employee[];
  availability: AvailabilityMap;
  preferences: PreferenceMap;
  shiftDemand: ShiftDemand;
  shiftTemplates: ShiftTemplateMap;
  specialSettings: SpecialSettings;
  schedule: WeeklySchedule;
};

export type ScheduleWarning = {
  type: "fallback" | "missing" | "constraint";
  message: string;
};

export type ScheduleOption = {
  id: string;
  label: string;
  schedule: WeeklySchedule;
  warnings: ScheduleWarning[];
};

export type EmployeeStats = {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  countHours: number;
  workDays: number;
  earlyCount: number;
  midCount: number;
  lateCount: number;
};
