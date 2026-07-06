import {
  AppState,
  AvailabilityEntry,
  Day,
  Employee,
  EmployeePreference,
  ShiftDemand,
  ShiftTemplateMap,
  ShiftType,
  WeeklySchedule,
  days,
} from "./types";

export const shiftLabels: Record<ShiftType, string> = {
  early: "Early",
  mid: "Mid",
  late: "Late",
};

export const dayLabels: Record<Day, string> = {
  Monday: "Monday",
  Tuesday: "Tuesday",
  Wednesday: "Wednesday",
  Thursday: "Thursday",
  Friday: "Friday",
  Saturday: "Saturday",
  Sunday: "Sunday",
};

export const shiftColors: Record<ShiftType, string> = {
  early: "#35a77c",
  mid: "#4f7fd9",
  late: "#be6adf",
};

export const defaultEmployees: Employee[] = [
  { id: "emp-patrick", name: "Patrick", type: "full-time", enabled: true },
  { id: "emp-tom", name: "Tom", type: "full-time", enabled: true },
  { id: "emp-amy", name: "Amy", type: "casual", enabled: true },
  { id: "emp-john", name: "John", type: "casual", enabled: true },
];

export const defaultAvailabilityEntry: AvailabilityEntry = {
  available: true,
  start: "09:45",
  end: "23:00",
};

export const defaultPreference = (employee?: Employee): EmployeePreference => ({
  shiftPreference: "any",
  refuseLateShift: false,
  minDays: employee?.type === "full-time" ? 4 : 0,
  maxDays: employee?.type === "casual" ? 3 : 6,
  coworkers: [],
});

export const createEmptySchedule = (): WeeklySchedule =>
  days.reduce((schedule, day) => {
    schedule[day] = [];
    return schedule;
  }, {} as WeeklySchedule);

export const createDefaultAvailability = (
  employees: Employee[],
): AppState["availability"] =>
  employees.reduce((map, employee) => {
    map[employee.id] = days.reduce((dayMap, day) => {
      dayMap[day] = { ...defaultAvailabilityEntry };
      return dayMap;
    }, {} as Record<Day, AvailabilityEntry>);
    return map;
  }, {} as AppState["availability"]);

export const createDefaultPreferences = (
  employees: Employee[],
): AppState["preferences"] =>
  employees.reduce((map, employee) => {
    map[employee.id] = defaultPreference(employee);
    return map;
  }, {} as AppState["preferences"]);

export const defaultShiftDemand: ShiftDemand = days.reduce((demand, day) => {
  const isWeekendDemand = day === "Friday" || day === "Sunday";
  demand[day] = {
    early: 1,
    mid: 1,
    late: day === "Saturday" ? 3 : isWeekendDemand ? 2 : 1,
  };
  return demand;
}, {} as ShiftDemand);

export const defaultShiftTemplates: ShiftTemplateMap = days.reduce((templates, day) => {
  const isLongWeekendDay = day === "Friday" || day === "Saturday" || day === "Sunday";
  templates[day] = {
    early: { start: "09:45", end: isLongWeekendDay ? "18:45" : "19:45" },
    mid: { start: "11:00", end: isLongWeekendDay ? "20:00" : "21:00" },
    late: { start: "13:00", end: "23:00" },
  };
  return templates;
}, {} as ShiftTemplateMap);

export const createDefaultShiftTemplates = (): ShiftTemplateMap =>
  days.reduce((templates, day) => {
    templates[day] = {
      early: { ...defaultShiftTemplates[day].early },
      mid: { ...defaultShiftTemplates[day].mid },
      late: { ...defaultShiftTemplates[day].late },
    };
    return templates;
  }, {} as ShiftTemplateMap);

export const createDefaultState = (): AppState => ({
  employees: defaultEmployees,
  availability: createDefaultAvailability(defaultEmployees),
  preferences: createDefaultPreferences(defaultEmployees),
  shiftDemand: defaultShiftDemand,
  shiftTemplates: createDefaultShiftTemplates(),
  specialSettings: {
    earlyAllowedEmployeeIds: defaultEmployees.map((employee) => employee.id),
    priorityMode: "balance-first",
    shiftTypeCapEnabled: true,
  },
  schedule: createEmptySchedule(),
});

export const getShiftTemplate = (
  day: Day,
  shiftType: ShiftType,
  shiftTemplates: ShiftTemplateMap = defaultShiftTemplates,
) => shiftTemplates[day]?.[shiftType] ?? defaultShiftTemplates[day][shiftType];
