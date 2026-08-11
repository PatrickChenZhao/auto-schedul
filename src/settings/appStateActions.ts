import {
  createDefaultAvailability,
  createDefaultShiftTemplates,
  defaultAvailabilityEntry,
  defaultPreference,
} from "../data";
import {
  AppState,
  AvailabilityEntry,
  Day,
  Employee,
  EmployeePreference,
  PriorityMode,
  ShiftTemplate,
  ShiftType,
  days,
} from "../types";

export const addEmployeeToState = (state: AppState, employee: Employee): AppState => ({
  ...state,
  employees: [...state.employees, employee],
  availability: {
    ...state.availability,
    ...createDefaultAvailability([employee]),
  },
  preferences: {
    ...state.preferences,
    [employee.id]: defaultPreference(employee),
  },
  specialSettings: {
    ...state.specialSettings,
    earlyAllowedEmployeeIds: [
      ...state.specialSettings.earlyAllowedEmployeeIds,
      employee.id,
    ],
  },
});

export const moveEmployeeInState = (
  state: AppState,
  sourceId: string,
  targetId: string,
): AppState => {
  if (sourceId === targetId) return state;

  const sourceIndex = state.employees.findIndex((employee) => employee.id === sourceId);
  const targetIndex = state.employees.findIndex((employee) => employee.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return state;

  const employees = [...state.employees];
  const [movedEmployee] = employees.splice(sourceIndex, 1);
  employees.splice(targetIndex, 0, movedEmployee);

  return { ...state, employees };
};

export const renameEmployeeInState = (
  state: AppState,
  employeeId: string,
  name: string,
): AppState => ({
  ...state,
  employees: state.employees.map((employee) =>
    employee.id === employeeId ? { ...employee, name } : employee,
  ),
});

export const setEmployeeTypeInState = (
  state: AppState,
  employeeId: string,
  type: Employee["type"],
): AppState => ({
  ...state,
  employees: state.employees.map((employee) =>
    employee.id === employeeId ? { ...employee, type } : employee,
  ),
  preferences: {
    ...state.preferences,
    [employeeId]: {
      ...state.preferences[employeeId],
      maxDays:
        type === "casual"
          ? Math.min(state.preferences[employeeId]?.maxDays ?? 3, 3)
          : state.preferences[employeeId]?.maxDays ?? 6,
    },
  },
});

export const setEmployeeEnabledInState = (
  state: AppState,
  employeeId: string,
  enabled: boolean,
): AppState => ({
  ...state,
  employees: state.employees.map((employee) =>
    employee.id === employeeId ? { ...employee, enabled } : employee,
  ),
});

export const removeEmployeeFromState = (
  state: AppState,
  employeeId: string,
): AppState => {
  const availability = { ...state.availability };
  const preferences = { ...state.preferences };
  delete availability[employeeId];
  delete preferences[employeeId];

  return {
    ...state,
    employees: state.employees.filter((employee) => employee.id !== employeeId),
    availability,
    preferences,
    specialSettings: {
      ...state.specialSettings,
      earlyAllowedEmployeeIds: state.specialSettings.earlyAllowedEmployeeIds.filter(
        (id) => id !== employeeId,
      ),
    },
    schedule: Object.fromEntries(
      days.map((day) => [
        day,
        state.schedule[day].filter((assignment) => assignment.employeeId !== employeeId),
      ]),
    ) as AppState["schedule"],
  };
};

export const updateAvailabilityInState = (
  state: AppState,
  employeeId: string,
  day: Day,
  patch: Partial<AvailabilityEntry>,
): AppState => ({
  ...state,
  availability: {
    ...state.availability,
    [employeeId]: {
      ...state.availability[employeeId],
      [day]: {
        ...(state.availability[employeeId]?.[day] ?? defaultAvailabilityEntry),
        ...patch,
      },
    },
  },
});

export const updatePreferenceInState = (
  state: AppState,
  employeeId: string,
  patch: Partial<EmployeePreference>,
): AppState => ({
  ...state,
  preferences: {
    ...state.preferences,
    [employeeId]: {
      ...state.preferences[employeeId],
      ...patch,
    },
  },
});

export const setShiftDemandInState = (
  state: AppState,
  day: Day,
  shiftType: ShiftType,
  demand: number,
): AppState => ({
  ...state,
  shiftDemand: {
    ...state.shiftDemand,
    [day]: {
      ...state.shiftDemand[day],
      [shiftType]: demand,
    },
  },
});

export const setShiftTemplateInState = (
  state: AppState,
  day: Day,
  shiftType: ShiftType,
  template: ShiftTemplate,
): AppState => ({
  ...state,
  shiftTemplates: {
    ...state.shiftTemplates,
    [day]: {
      ...state.shiftTemplates[day],
      [shiftType]: template,
    },
  },
});

export const resetShiftTemplatesInState = (state: AppState): AppState => ({
  ...state,
  shiftTemplates: createDefaultShiftTemplates(),
});

export const setPriorityModeInState = (
  state: AppState,
  priorityMode: PriorityMode,
): AppState => ({
  ...state,
  specialSettings: { ...state.specialSettings, priorityMode },
});

export const setShiftTypeCapEnabledInState = (
  state: AppState,
  shiftTypeCapEnabled: boolean,
): AppState => ({
  ...state,
  specialSettings: { ...state.specialSettings, shiftTypeCapEnabled },
});

export const setEarlyShiftAllowedInState = (
  state: AppState,
  employeeId: string,
  allowed: boolean,
): AppState => ({
  ...state,
  specialSettings: {
    ...state.specialSettings,
    earlyAllowedEmployeeIds: allowed
      ? [...state.specialSettings.earlyAllowedEmployeeIds, employeeId]
      : state.specialSettings.earlyAllowedEmployeeIds.filter((id) => id !== employeeId),
  },
});
