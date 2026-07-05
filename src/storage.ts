import { AppState, days, shiftTypes } from "./types";
import {
  createDefaultAvailability,
  createDefaultState,
  defaultPreference,
} from "./data";

const STORAGE_KEY = "auto-shift-scheduler:app-state";

export const loadAppState = (): AppState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultState();
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeAppState(parsed);
  } catch {
    return createDefaultState();
  }
};

export const saveAppState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const normalizeAppState = (value: unknown): AppState => {
  const defaults = createDefaultState();
  const maybeState = value as Partial<AppState>;

  if (!maybeState || !Array.isArray(maybeState.employees)) {
    throw new Error("Invalid AppState: employees is required.");
  }

  const employees: AppState["employees"] = maybeState.employees.map((employee) => ({
    id: String(employee.id),
    name: String(employee.name || "Unnamed"),
    type: employee.type === "casual" ? "casual" : "full-time",
    enabled: Boolean(employee.enabled),
  }));

  const availability = { ...defaults.availability, ...maybeState.availability };
  const preferences = { ...defaults.preferences, ...maybeState.preferences };
  const shiftDemand = { ...defaults.shiftDemand, ...maybeState.shiftDemand };
  const schedule = { ...defaults.schedule, ...maybeState.schedule };

  employees.forEach((employee) => {
    availability[employee.id] =
      availability[employee.id] ?? createDefaultAvailability([employee])[employee.id];
    preferences[employee.id] =
      {
        ...defaultPreference(employee),
        ...preferences[employee.id],
        refuseLateShift: Boolean(preferences[employee.id]?.refuseLateShift),
      };
  });

  days.forEach((day) => {
    schedule[day] = Array.isArray(schedule[day]) ? schedule[day] : [];
    shiftDemand[day] = shiftDemand[day] ?? defaults.shiftDemand[day];
    shiftTypes.forEach((shiftType) => {
      shiftDemand[day][shiftType] = Number.isFinite(shiftDemand[day][shiftType])
        ? Number(shiftDemand[day][shiftType])
        : defaults.shiftDemand[day][shiftType];
    });
  });

  return {
    employees,
    availability,
    preferences,
    shiftDemand,
    specialSettings: {
      earlyAllowedEmployeeIds:
        maybeState.specialSettings?.earlyAllowedEmployeeIds?.map(String) ??
        employees.map((employee) => employee.id),
      priorityMode: ["balance-first", "binding-first", "work-day-first"].includes(
        maybeState.specialSettings?.priorityMode ?? "",
      )
        ? maybeState.specialSettings?.priorityMode ?? "balance-first"
        : "balance-first",
    },
    schedule,
  };
};
