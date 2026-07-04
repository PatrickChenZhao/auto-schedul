import { createEmptySchedule, getShiftTemplate } from "./data";
import { getHoursBetween } from "./time";
import { timeToMinutes } from "./time";
import {
  AppState,
  Day,
  Employee,
  ScheduleWarning,
  ShiftAssignment,
  ShiftType,
  WeeklySchedule,
  days,
  shiftTypes,
} from "./types";

type EngineContext = {
  state: AppState;
  schedule: WeeklySchedule;
  counts: Record<string, number>;
  hours: Record<string, number>;
  shiftGroupCounts: Record<"earlyMid" | "late", Record<string, number>>;
  warnings: ScheduleWarning[];
};

const isAvailableForShift = (
  state: AppState,
  employeeId: string,
  day: Day,
  shiftType: ShiftType,
) => {
  const availability = state.availability[employeeId]?.[day];
  if (!availability?.available) return false;
  const shift = getShiftTemplate(day, shiftType);
  return (
    timeToMinutes(availability.start) <= timeToMinutes(shift.start) &&
    timeToMinutes(availability.end) >= timeToMinutes(shift.end)
  );
};

const alreadyScheduled = (
  schedule: WeeklySchedule,
  employeeId: string,
  day: Day,
) => schedule[day].some((assignment) => assignment.employeeId === employeeId);

const getMaxDays = (state: AppState, employee: Employee) => {
  const configured = state.preferences[employee.id]?.maxDays;
  if (Number.isFinite(configured)) return configured;
  return employee.type === "casual" ? 3 : 6;
};

const canAssignEmployee = (
  context: EngineContext,
  employee: Employee,
  day: Day,
  shiftType: ShiftType,
) => {
  const earlyAllowed = new Set(context.state.specialSettings.earlyAllowedEmployeeIds);
  const preference = context.state.preferences[employee.id];
  return (
    employee.enabled &&
    isAvailableForShift(context.state, employee.id, day, shiftType) &&
    !alreadyScheduled(context.schedule, employee.id, day) &&
    (shiftType !== "early" || earlyAllowed.has(employee.id)) &&
    (shiftType !== "late" || !preference?.refuseLateShift) &&
    (context.counts[employee.id] ?? 0) < getMaxDays(context.state, employee)
  );
};

const getShiftGroup = (shiftType: ShiftType) =>
  shiftType === "late" ? "late" : "earlyMid";

const isComplementaryPair = (
  candidateShift: ShiftType,
  coworkerShift: ShiftType,
) =>
  (candidateShift === "late" && coworkerShift !== "late") ||
  (candidateShift !== "late" && coworkerShift === "late");

const getCoworkerBindingRank = (
  context: EngineContext,
  employee: Employee,
  day: Day,
  shiftType: ShiftType,
) => {
  let bestRank = 2;

  context.schedule[day].forEach((assignment) => {
    if (!isComplementaryPair(shiftType, assignment.shiftType)) return;

    const employeePreference = context.state.preferences[employee.id];
    const scheduledPreference = context.state.preferences[assignment.employeeId];
    const employeeToScheduled = employeePreference?.coworkers.find(
      (coworker) => coworker.coworkerId === assignment.employeeId,
    );
    const scheduledToEmployee = scheduledPreference?.coworkers.find(
      (coworker) => coworker.coworkerId === employee.id,
    );
    const relationships = [employeeToScheduled, scheduledToEmployee].filter(Boolean);

    if (relationships.some((relationship) => relationship?.type === "hard")) {
      bestRank = Math.min(bestRank, 0);
    } else if (relationships.some((relationship) => relationship?.type === "soft")) {
      bestRank = Math.min(bestRank, 1);
    }
  });

  return bestRank;
};

const scoreCandidate = (
  context: EngineContext,
  employee: Employee,
  day: Day,
  shiftType: ShiftType,
) => {
  const preference = context.state.preferences[employee.id];
  const assignedDays = context.counts[employee.id] ?? 0;
  const minDays = preference?.minDays ?? 0;
  const needsMinimum = assignedDays < minDays ? 0 : 1;
  const typeRank = employee.type === "full-time" ? 0 : 1;
  const casualLoad = employee.type === "casual" ? assignedDays : 0;
  const fullTimeHoursRank =
    employee.type === "full-time" ? context.hours[employee.id] ?? 0 : 0;
  const fullTimeBalanceRank =
    employee.type === "full-time"
      ? context.shiftGroupCounts[getShiftGroup(shiftType)][employee.id] ?? 0
      : 0;
  const coworkerBindingRank = getCoworkerBindingRank(
    context,
    employee,
    day,
    shiftType,
  );
  const shiftPreferenceRank =
    preference?.shiftPreference === shiftType
      ? 0
      : preference?.shiftPreference === "any" || !preference
        ? 1
        : 2;
  const priorityRanks =
    context.state.specialSettings.priorityMode === "binding-first"
      ? [coworkerBindingRank, fullTimeBalanceRank, fullTimeHoursRank]
      : [fullTimeBalanceRank, fullTimeHoursRank, coworkerBindingRank];

  return [
    typeRank,
    ...priorityRanks,
    needsMinimum,
    employee.type === "casual" ? casualLoad : assignedDays,
    shiftPreferenceRank,
    employee.name.toLowerCase(),
  ];
};

const compareScores = (a: Array<number | string>, b: Array<number | string>) => {
  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index];
    const bValue = b[index];
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
  }
  return 0;
};

const getCandidates = (
  context: EngineContext,
  day: Day,
  shiftType: ShiftType,
) => {
  return context.state.employees
    .filter((employee) =>
      canAssignEmployee(
        context,
        employee,
        day,
        shiftType,
      ),
    )
    .sort((left, right) =>
      compareScores(
        scoreCandidate(context, left, day, shiftType),
        scoreCandidate(context, right, day, shiftType),
      ),
    );
};

const addAssignment = (
  context: EngineContext,
  day: Day,
  employee: Employee,
  shiftType: ShiftType,
) => {
  context.schedule[day].push({ employeeId: employee.id, shiftType });
  context.counts[employee.id] = (context.counts[employee.id] ?? 0) + 1;
  const shiftTemplate = getShiftTemplate(day, shiftType);
  context.hours[employee.id] =
    (context.hours[employee.id] ?? 0) +
    getHoursBetween(shiftTemplate.start, shiftTemplate.end);
  const shiftGroup = getShiftGroup(shiftType);
  context.shiftGroupCounts[shiftGroup][employee.id] =
    (context.shiftGroupCounts[shiftGroup][employee.id] ?? 0) + 1;
};

const fillShift = (
  context: EngineContext,
  day: Day,
  shiftType: ShiftType,
) => {
  const demand = Math.max(0, context.state.shiftDemand[day][shiftType] ?? 0);
  let assigned = 0;

  while (assigned < demand) {
    const candidates = getCandidates(context, day, shiftType);

    if (candidates.length === 0) break;

    addAssignment(context, day, candidates[0], shiftType);
    assigned += 1;
  }

  if (assigned < demand) {
    context.warnings.push({
      type: "missing",
      message: `${day} - ${shiftType[0].toUpperCase()}${shiftType.slice(1)} Shift: ${
        demand - assigned
      } person${demand - assigned === 1 ? "" : "s"} missing`,
    });
  }
};

export const generateWeeklySchedule = (state: AppState) => {
  const context: EngineContext = {
    state,
    schedule: createEmptySchedule(),
    counts: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
    hours: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
    shiftGroupCounts: {
      earlyMid: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
      late: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
    },
    warnings: [],
  };

  shiftTypes.forEach((shiftType) => {
    days.forEach((day) => fillShift(context, day, shiftType));
  });

  Object.values(context.schedule).forEach((assignments) =>
    assignments.sort((left, right) => {
      const leftIndex = shiftTypes.indexOf(left.shiftType);
      const rightIndex = shiftTypes.indexOf(right.shiftType);
      return leftIndex - rightIndex;
    }),
  );

  return {
    schedule: context.schedule,
    warnings: context.warnings,
  };
};

export const upsertManualShift = (
  schedule: WeeklySchedule,
  day: Day,
  assignment: ShiftAssignment,
) => ({
  ...schedule,
  [day]: [
    ...schedule[day].filter((item) => item.employeeId !== assignment.employeeId),
    assignment,
  ],
});

export const deleteManualShift = (
  schedule: WeeklySchedule,
  day: Day,
  employeeId: string,
) => ({
  ...schedule,
  [day]: schedule[day].filter((assignment) => assignment.employeeId !== employeeId),
});
