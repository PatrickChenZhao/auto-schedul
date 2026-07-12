import { createEmptySchedule, getShiftTemplate } from "./data";
import { getHoursBetween } from "./time";
import { timeToMinutes } from "./time";
import {
  AppState,
  Day,
  Employee,
  ScheduleOption,
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
  assignmentStep: number;
};

type ScheduleResult = {
  schedule: WeeklySchedule;
  warnings: ScheduleWarning[];
  score: number;
};

type CandidateSelector = (
  context: EngineContext,
  day: Day,
  shiftType: ShiftType,
  candidates: Employee[],
  assignedInShift: number,
) => Employee;

const rebalanceDays: Day[] = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

const maxSameShiftTypePerWeek = 3;

const autoCompleteDayLabels: Record<Day, string> = {
  Monday: "星期一",
  Tuesday: "星期二",
  Wednesday: "星期三",
  Thursday: "星期四",
  Friday: "星期五",
  Saturday: "星期六",
  Sunday: "星期日",
};

const autoCompleteShiftLabels: Record<ShiftType, string> = {
  early: "早班",
  mid: "中班",
  late: "晚班",
};

const isShiftTypeCapEnabled = (state: AppState) =>
  state.specialSettings.shiftTypeCapEnabled !== false;

const isAvailableForShift = (
  state: AppState,
  employeeId: string,
  day: Day,
  shiftType: ShiftType,
) => {
  const availability = state.availability[employeeId]?.[day];
  if (!availability?.available) return false;
  const shift = getShiftTemplate(day, shiftType, state.shiftTemplates);
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

const countShiftTypeAssignments = (
  schedule: WeeklySchedule,
  employeeId: string,
  shiftType: ShiftType,
) =>
  days.reduce(
    (count, day) =>
      count +
      schedule[day].filter(
        (assignment) =>
          assignment.employeeId === employeeId &&
          assignment.shiftType === shiftType,
      ).length,
    0,
  );

const getMaxDays = (state: AppState, employee: Employee) => {
  const configured = state.preferences[employee.id]?.maxDays;
  if (Number.isFinite(configured)) return configured;
  return employee.type === "casual" ? 3 : 6;
};

const getMinDays = (state: AppState, employee: Employee) => {
  const configured = state.preferences[employee.id]?.minDays;
  return Number.isFinite(configured) ? configured : 0;
};

const isBelowMinimumDays = (context: EngineContext, employee: Employee) =>
  (context.counts[employee.id] ?? 0) < getMinDays(context.state, employee);

const usesBindingFirst = (state: AppState) =>
  state.specialSettings.priorityMode === "binding-first" ||
  state.specialSettings.priorityMode === "work-day-first";

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
    (!isShiftTypeCapEnabled(context.state) ||
      countShiftTypeAssignments(context.schedule, employee.id, shiftType) <
        maxSameShiftTypePerWeek) &&
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
  const minDays = getMinDays(context.state, employee);
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
  const priorityRanks = usesBindingFirst(context.state)
      ? [coworkerBindingRank, fullTimeBalanceRank, fullTimeHoursRank]
      : [fullTimeBalanceRank, fullTimeHoursRank, coworkerBindingRank];

  if (context.state.specialSettings.priorityMode === "work-day-first") {
    return [
      typeRank,
      needsMinimum,
      ...priorityRanks,
      employee.type === "casual" ? casualLoad : assignedDays,
      shiftPreferenceRank,
      employee.name.toLowerCase(),
    ];
  }

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
  const candidates = context.state.employees
    .filter((employee) =>
      canAssignEmployee(
        context,
        employee,
        day,
        shiftType,
      ),
    );
  const filteredCandidates =
    context.state.specialSettings.priorityMode === "work-day-first" &&
    candidates.some((employee) => isBelowMinimumDays(context, employee))
      ? candidates.filter((employee) => isBelowMinimumDays(context, employee))
      : candidates;

  return filteredCandidates.sort((left, right) =>
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
  context.assignmentStep += 1;
  context.counts[employee.id] = (context.counts[employee.id] ?? 0) + 1;
  const shiftTemplate = getShiftTemplate(day, shiftType, context.state.shiftTemplates);
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
  selectCandidate: CandidateSelector,
) => {
  const demand = Math.max(0, context.state.shiftDemand[day][shiftType] ?? 0);
  let assigned = context.schedule[day].filter(
    (assignment) => assignment.shiftType === shiftType,
  ).length;

  while (assigned < demand) {
    const candidates = getCandidates(context, day, shiftType);

    if (candidates.length === 0) break;

    addAssignment(
      context,
      day,
      selectCandidate(context, day, shiftType, candidates, assigned),
      shiftType,
    );
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

const canWorkShift = (
  state: AppState,
  employee: Employee,
  day: Day,
  shiftType: ShiftType,
) => {
  const earlyAllowed = new Set(state.specialSettings.earlyAllowedEmployeeIds);
  const preference = state.preferences[employee.id];
  return (
    employee.enabled &&
    isAvailableForShift(state, employee.id, day, shiftType) &&
    (shiftType !== "early" || earlyAllowed.has(employee.id)) &&
    (shiftType !== "late" || !preference?.refuseLateShift)
  );
};

const getCoworkerRelationshipRank = (
  state: AppState,
  employeeId: string,
  coworkerId: string,
) => {
  const employeeToCoworker = state.preferences[employeeId]?.coworkers.find(
    (coworker) => coworker.coworkerId === coworkerId,
  );
  const coworkerToEmployee = state.preferences[coworkerId]?.coworkers.find(
    (coworker) => coworker.coworkerId === employeeId,
  );
  const relationships = [employeeToCoworker, coworkerToEmployee].filter(Boolean);

  if (relationships.some((relationship) => relationship?.type === "hard")) return 0;
  if (relationships.some((relationship) => relationship?.type === "soft")) return 1;
  return null;
};

const getEmployeeShiftCounts = (
  schedule: WeeklySchedule,
  employeeId: string,
): Record<ShiftType, number> => {
  const counts = Object.fromEntries(
    shiftTypes.map((shiftType) => [shiftType, 0]),
  ) as Record<ShiftType, number>;

  days.forEach((day) => {
    schedule[day].forEach((assignment) => {
      if (assignment.employeeId === employeeId) {
        counts[assignment.shiftType] += 1;
      }
    });
  });

  return counts;
};

const hasShiftTypeCapViolation = (
  state: AppState,
  schedule: WeeklySchedule,
) =>
  isShiftTypeCapEnabled(state) &&
  state.employees.some((employee) => {
    const counts = getEmployeeShiftCounts(schedule, employee.id);
    return shiftTypes.some(
      (shiftType) => counts[shiftType] > maxSameShiftTypePerWeek,
    );
  });

const getShiftBalancePenalty = (counts: Record<ShiftType, number>) => {
  const values = shiftTypes.map((shiftType) => counts[shiftType]);
  const total = values.reduce((sum, count) => sum + count, 0);
  if (total <= 1) return 0;

  const spread = Math.max(...values) - Math.min(...values);
  const concentration = values.reduce((sum, count) => sum + count * count, 0);
  const missingShiftPenalty = values.filter((count) => count === 0).length * 35;

  return spread * 120 + concentration * 20 + missingShiftPenalty;
};

const getDailyBindingLatePenalty = (state: AppState, schedule: WeeklySchedule) => {
  let penalty = 0;

  days.forEach((day) => {
    const assignments = schedule[day];
    assignments.forEach((assignment) => {
      const bestRelationshipRank = assignments.reduce<number | null>(
        (bestRank, otherAssignment) => {
          if (assignment.employeeId === otherAssignment.employeeId) return bestRank;

          const relationshipRank = getCoworkerRelationshipRank(
            state,
            assignment.employeeId,
            otherAssignment.employeeId,
          );

          if (relationshipRank === null) return bestRank;
          return bestRank === null
            ? relationshipRank
            : Math.min(bestRank, relationshipRank);
        },
        null,
      );

      if (bestRelationshipRank === null || assignment.shiftType === "late") return;
      penalty += bestRelationshipRank === 0 ? 900 : 450;
    });
  });

  return penalty;
};

const scoreRebalanceQuality = (context: EngineContext, schedule: WeeklySchedule) => {
  if (hasShiftTypeCapViolation(context.state, schedule)) return Number.POSITIVE_INFINITY;

  const enabledEmployees = context.state.employees.filter((employee) => employee.enabled);
  const balancePenalty = enabledEmployees.reduce(
    (sum, employee) =>
      sum + getShiftBalancePenalty(getEmployeeShiftCounts(schedule, employee.id)),
    0,
  );

  return balancePenalty + getDailyBindingLatePenalty(context.state, schedule);
};

const isFeasibleDayShiftMix = (
  context: EngineContext,
  day: Day,
  assignments: ShiftAssignment[],
  shiftMix: ShiftType[],
) => {
  const employeeById = new Map(
    context.state.employees.map((employee) => [employee.id, employee]),
  );

  return assignments.every((assignment, index) => {
    const employee = employeeById.get(assignment.employeeId);
    return employee
      ? canWorkShift(context.state, employee, day, shiftMix[index])
      : false;
  }) && !hasShiftTypeCapViolation(
    context.state,
    withDayShiftMix(context.schedule, day, shiftMix),
  );
};

const withDayShiftMix = (
  schedule: WeeklySchedule,
  day: Day,
  shiftMix: ShiftType[],
) => ({
  ...schedule,
  [day]: schedule[day].map((assignment, index) => ({
    ...assignment,
    shiftType: shiftMix[index],
  })),
});

const withDayAssignmentChanges = (
  schedule: WeeklySchedule,
  day: Day,
  changes: Record<string, ShiftType>,
) => ({
  ...schedule,
  [day]: schedule[day].map((assignment) => ({
    ...assignment,
    shiftType: changes[assignment.employeeId] ?? assignment.shiftType,
  })),
});

const tryOptimizeDayShiftMix = (context: EngineContext, day: Day) => {
  const assignments = context.schedule[day];
  if (assignments.length < 2) return false;

  const remaining = Object.fromEntries(
    shiftTypes.map((shiftType) => [
      shiftType,
      assignments.filter((assignment) => assignment.shiftType === shiftType).length,
    ]),
  ) as Record<ShiftType, number>;
  const currentShiftMix = assignments.map((assignment) => assignment.shiftType);
  let bestScore = scoreRebalanceQuality(context, context.schedule);
  let bestShiftMix: ShiftType[] | null = null;
  let checked = 0;
  const maxChecks = 10000;

  const visit = (shiftMix: ShiftType[]) => {
    if (checked >= maxChecks) return;

    if (shiftMix.length === assignments.length) {
      checked += 1;

      if (
        shiftMix.every((shiftType, index) => shiftType === currentShiftMix[index]) ||
        !isFeasibleDayShiftMix(context, day, assignments, shiftMix)
      ) {
        return;
      }

      const candidateSchedule = withDayShiftMix(context.schedule, day, shiftMix);
      const candidateScore = scoreRebalanceQuality(context, candidateSchedule);

      if (candidateScore < bestScore) {
        bestScore = candidateScore;
        bestShiftMix = [...shiftMix];
      }

      return;
    }

    shiftTypes.forEach((shiftType) => {
      if (remaining[shiftType] <= 0) return;

      remaining[shiftType] -= 1;
      shiftMix.push(shiftType);
      visit(shiftMix);
      shiftMix.pop();
      remaining[shiftType] += 1;
    });
  };

  visit([]);

  if (!bestShiftMix) return false;

  const selectedShiftMix = bestShiftMix;
  context.schedule[day] = context.schedule[day].map((assignment, index) => ({
    ...assignment,
    shiftType: selectedShiftMix[index],
  }));

  return true;
};

const tryRebalanceEmployeeShifts = (
  context: EngineContext,
  employee: Employee,
) => {
  const counts = getEmployeeShiftCounts(context.schedule, employee.id);
  const highestCount = Math.max(...shiftTypes.map((shiftType) => counts[shiftType]));
  const lowestCount = Math.min(...shiftTypes.map((shiftType) => counts[shiftType]));

  if (highestCount - lowestCount < 2) return false;

  const overrepresentedShifts = shiftTypes.filter(
    (shiftType) => counts[shiftType] === highestCount,
  );
  const underrepresentedShifts = new Set(
    shiftTypes.filter((shiftType) => counts[shiftType] === lowestCount),
  );
  const employeeById = new Map(
    context.state.employees.map((item) => [item.id, item]),
  );

  for (const overrepresentedShift of overrepresentedShifts) {
    for (const day of rebalanceDays) {
      const dayAssignments = context.schedule[day];
      const employeeAssignment = dayAssignments.find(
        (assignment) =>
          assignment.employeeId === employee.id &&
          assignment.shiftType === overrepresentedShift,
      );

      if (!employeeAssignment) continue;

      const boundAssignments = dayAssignments
        .map((assignment) => ({
          assignment,
          rank: getCoworkerRelationshipRank(
            context.state,
            employee.id,
            assignment.employeeId,
          ),
        }))
        .filter(
          (item): item is { assignment: ShiftAssignment; rank: number } =>
            item.assignment.employeeId !== employee.id &&
            item.rank !== null &&
            underrepresentedShifts.has(item.assignment.shiftType),
        )
        .sort((left, right) => left.rank - right.rank);

      for (const { assignment: boundAssignment } of boundAssignments) {
        const boundEmployee = employeeById.get(boundAssignment.employeeId);
        if (!boundEmployee) continue;

        if (overrepresentedShift === "late") {
          const candidateSchedule = withDayAssignmentChanges(context.schedule, day, {
            [employee.id]: boundAssignment.shiftType,
            [boundEmployee.id]: "late",
          });

          if (
            !canWorkShift(context.state, employee, day, boundAssignment.shiftType) ||
            !canWorkShift(context.state, boundEmployee, day, "late") ||
            hasShiftTypeCapViolation(context.state, candidateSchedule)
          ) {
            continue;
          }

          employeeAssignment.shiftType = boundAssignment.shiftType;
          boundAssignment.shiftType = "late";
          return true;
        }

        if (boundAssignment.shiftType === "late") continue;

        const lateAssignment = dayAssignments.find(
          (assignment) =>
            assignment.shiftType === "late" &&
            assignment.employeeId !== employee.id &&
            assignment.employeeId !== boundAssignment.employeeId,
        );
        const lateEmployee = lateAssignment
          ? employeeById.get(lateAssignment.employeeId)
          : undefined;
        const candidateSchedule =
          lateEmployee && lateAssignment
            ? withDayAssignmentChanges(context.schedule, day, {
                [employee.id]: boundAssignment.shiftType,
                [boundEmployee.id]: "late",
                [lateEmployee.id]: overrepresentedShift,
              })
            : null;

        if (
          !lateAssignment ||
          !lateEmployee ||
          !candidateSchedule ||
          !canWorkShift(context.state, employee, day, boundAssignment.shiftType) ||
          !canWorkShift(context.state, boundEmployee, day, "late") ||
          !canWorkShift(context.state, lateEmployee, day, overrepresentedShift) ||
          hasShiftTypeCapViolation(context.state, candidateSchedule)
        ) {
          continue;
        }

        employeeAssignment.shiftType = boundAssignment.shiftType;
        boundAssignment.shiftType = "late";
        lateAssignment.shiftType = overrepresentedShift;
        return true;
      }
    }
  }

  return false;
};

const recalculateContextMetrics = (context: EngineContext) => {
  context.counts = Object.fromEntries(
    context.state.employees.map((employee) => [employee.id, 0]),
  );
  context.hours = Object.fromEntries(
    context.state.employees.map((employee) => [employee.id, 0]),
  );
  context.shiftGroupCounts = {
    earlyMid: Object.fromEntries(
      context.state.employees.map((employee) => [employee.id, 0]),
    ),
    late: Object.fromEntries(
      context.state.employees.map((employee) => [employee.id, 0]),
    ),
  };

  days.forEach((day) => {
    context.schedule[day].forEach((assignment) => {
      const shiftTemplate = getShiftTemplate(
        day,
        assignment.shiftType,
        context.state.shiftTemplates,
      );
      context.counts[assignment.employeeId] =
        (context.counts[assignment.employeeId] ?? 0) + 1;
      context.hours[assignment.employeeId] =
        (context.hours[assignment.employeeId] ?? 0) +
        getHoursBetween(shiftTemplate.start, shiftTemplate.end);
      const shiftGroup = getShiftGroup(assignment.shiftType);
      context.shiftGroupCounts[shiftGroup][assignment.employeeId] =
        (context.shiftGroupCounts[shiftGroup][assignment.employeeId] ?? 0) + 1;
    });
  });
};

const rebalanceBoundCoworkerShifts = (context: EngineContext) => {
  const maxPasses = 20;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const changedByDayMix = rebalanceDays.some((day) =>
      tryOptimizeDayShiftMix(context, day),
    );
    const changedByEmployeeSwap = context.state.employees
      .filter((employee) => employee.enabled)
      .some((employee) => tryRebalanceEmployeeShifts(context, employee));

    if (!changedByDayMix && !changedByEmployeeSwap) break;
  }

  recalculateContextMetrics(context);
};

const addMinimumDayWarnings = (context: EngineContext) => {
  if (context.state.specialSettings.priorityMode !== "work-day-first") return;

  context.state.employees
    .filter((employee) => employee.enabled)
    .forEach((employee) => {
      const minDays = getMinDays(context.state, employee);
      const assignedDays = context.counts[employee.id] ?? 0;

      if (assignedDays < minDays) {
        context.warnings.push({
          type: "constraint",
          message: `${employee.name}: ${assignedDays}/${minDays} minimum work days scheduled`,
        });
      }
    });
};

const cloneSchedule = (schedule: WeeklySchedule) =>
  days.reduce((copy, day) => {
    copy[day] = schedule[day].map((assignment) => ({ ...assignment }));
    return copy;
  }, {} as WeeklySchedule);

const createEmptyContextMetrics = (state: AppState) => ({
  counts: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
  hours: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
  shiftGroupCounts: {
    earlyMid: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
    late: Object.fromEntries(state.employees.map((employee) => [employee.id, 0])),
  },
});

const createContext = (
  state: AppState,
  initialSchedule: WeeklySchedule = createEmptySchedule(),
): EngineContext => {
  const metrics = createEmptyContextMetrics(state);
  const context: EngineContext = {
    state,
    schedule: cloneSchedule(initialSchedule),
    counts: metrics.counts,
    hours: metrics.hours,
    shiftGroupCounts: metrics.shiftGroupCounts,
    warnings: [],
    assignmentStep: 0,
  };
  recalculateContextMetrics(context);
  return context;
};

const sortSchedule = (schedule: WeeklySchedule) => {
  Object.values(schedule).forEach((assignments) =>
    assignments.sort((left, right) => {
      const leftIndex = shiftTypes.indexOf(left.shiftType);
      const rightIndex = shiftTypes.indexOf(right.shiftType);
      return leftIndex - rightIndex;
    }),
  );
};

const createVariantSelector = (variantSeed: number): CandidateSelector => {
  if (variantSeed === 0) {
    return (_context, _day, _shiftType, candidates) => candidates[0];
  }

  return (context, day, shiftType, candidates, assignedInShift) => {
    const choiceCount = Math.min(candidates.length, 4);
    const dayRank = days.indexOf(day) + 1;
    const shiftRank = shiftTypes.indexOf(shiftType) + 1;
    const branchIndex =
      (variantSeed * dayRank + shiftRank + context.assignmentStep + assignedInShift) %
      choiceCount;
    return candidates[branchIndex];
  };
};

const scoreSchedule = (state: AppState, schedule: WeeklySchedule, warnings: ScheduleWarning[]) => {
  const assignmentCounts = Object.fromEntries(
    state.employees.map((employee) => [employee.id, 0]),
  );
  const assignmentHours = Object.fromEntries(
    state.employees.map((employee) => [employee.id, 0]),
  );
  let preferencePenalty = 0;
  let hardCoworkerPenalty = 0;
  let softCoworkerPenalty = 0;

  days.forEach((day) => {
    schedule[day].forEach((assignment) => {
      const preference = state.preferences[assignment.employeeId];
      assignmentCounts[assignment.employeeId] =
        (assignmentCounts[assignment.employeeId] ?? 0) + 1;
      assignmentHours[assignment.employeeId] =
        (assignmentHours[assignment.employeeId] ?? 0) +
        getHoursBetween(
          getShiftTemplate(day, assignment.shiftType, state.shiftTemplates).start,
          getShiftTemplate(day, assignment.shiftType, state.shiftTemplates).end,
        );

      if (
        preference?.shiftPreference &&
        preference.shiftPreference !== "any" &&
        preference.shiftPreference !== assignment.shiftType
      ) {
        preferencePenalty += 1;
      }

      preference?.coworkers.forEach((coworker) => {
        const hasPreferredCoworker = schedule[day].some(
          (otherAssignment) =>
            otherAssignment.employeeId === coworker.coworkerId &&
            (isComplementaryPair(assignment.shiftType, otherAssignment.shiftType) ||
              otherAssignment.shiftType === "late"),
        );

        if (!hasPreferredCoworker) {
          if (coworker.type === "hard") hardCoworkerPenalty += 1;
          if (coworker.type === "soft") softCoworkerPenalty += 1;
        }
      });
    });
  });

  const enabledEmployees = state.employees.filter((employee) => employee.enabled);
  const fullTimeHours = enabledEmployees
    .filter((employee) => employee.type === "full-time")
    .map((employee) => assignmentHours[employee.id] ?? 0);
  const fullTimeHourSpread = fullTimeHours.length
    ? Math.max(...fullTimeHours) - Math.min(...fullTimeHours)
    : 0;
  const minDayPenalty = enabledEmployees.reduce((sum, employee) => {
    const minDays = state.preferences[employee.id]?.minDays ?? 0;
    return sum + Math.max(0, minDays - (assignmentCounts[employee.id] ?? 0));
  }, 0);
  const shiftTypeCapPenalty = isShiftTypeCapEnabled(state)
    ? enabledEmployees.reduce((sum, employee) => {
        const counts = getEmployeeShiftCounts(schedule, employee.id);
        return (
          sum +
          shiftTypes.reduce(
            (shiftSum, shiftType) =>
              shiftSum +
              Math.max(0, counts[shiftType] - maxSameShiftTypePerWeek),
            0,
          )
        );
      }, 0)
    : 0;
  const missingPenalty = warnings.filter((warning) => warning.type === "missing").length;
  const minDayPenaltyWeight =
    state.specialSettings.priorityMode === "work-day-first" ? 20000 : 300;

  return (
    missingPenalty * 10000 +
    shiftTypeCapPenalty * 50000 +
    minDayPenalty * minDayPenaltyWeight +
    hardCoworkerPenalty * 180 +
    softCoworkerPenalty * 60 +
    preferencePenalty * 35 +
    fullTimeHourSpread * 10
  );
};

const createScheduleSignature = (schedule: WeeklySchedule) =>
  days
    .map((day) =>
      schedule[day]
        .map((assignment) => `${assignment.employeeId}:${assignment.shiftType}`)
        .sort()
        .join(","),
    )
    .join("|");

const generateScheduleWithSelector = (
  state: AppState,
  selectCandidate: CandidateSelector,
): ScheduleResult => {
  const context = createContext(state);
  shiftTypes.forEach((shiftType) => {
    days.forEach((day) => fillShift(context, day, shiftType, selectCandidate));
  });

  rebalanceBoundCoworkerShifts(context);
  addMinimumDayWarnings(context);
  sortSchedule(context.schedule);

  return {
    schedule: context.schedule,
    warnings: context.warnings,
    score: scoreSchedule(state, context.schedule, context.warnings),
  };
};

export const generateWeeklyScheduleOptions = (
  state: AppState,
  optionCount = 5,
): ScheduleOption[] => {
  const candidates: ScheduleResult[] = [];
  const seen = new Set<string>();

  for (let seed = 0; seed < 60 && candidates.length < optionCount * 4; seed += 1) {
    const result = generateScheduleWithSelector(state, createVariantSelector(seed));
    const signature = createScheduleSignature(result.schedule);
    if (seen.has(signature)) continue;
    seen.add(signature);
    candidates.push(result);
  }

  return candidates
    .sort((left, right) => left.score - right.score)
    .slice(0, optionCount)
    .map((option, index) => ({
      id: `schedule-option-${index + 1}`,
      label: `方案 ${index + 1}`,
      schedule: option.schedule,
      warnings: option.warnings,
    }));
};

export const generateWeeklySchedule = (state: AppState) => {
  const [bestOption] = generateWeeklyScheduleOptions(state, 1);
  return {
    schedule: bestOption?.schedule ?? createEmptySchedule(),
    warnings: bestOption?.warnings ?? [],
  };
};

export const autoCompleteSchedule = (state: AppState) => {
  const context = createContext(state, state.schedule);

  shiftTypes.forEach((shiftType) => {
    days.forEach((day) => fillShift(context, day, shiftType, createVariantSelector(0)));
  });

  sortSchedule(context.schedule);

  const missingWarnings = days.flatMap((day) =>
    shiftTypes
      .filter(
        (shiftType) =>
          context.schedule[day].filter((assignment) => assignment.shiftType === shiftType)
            .length < Math.max(0, state.shiftDemand[day][shiftType] ?? 0),
      )
      .map(
        (shiftType): ScheduleWarning => ({
          type: "missing",
          message: `${autoCompleteDayLabels[day]}-${autoCompleteShiftLabels[shiftType]}缺人-无法补全`,
        }),
      ),
  );

  return {
    schedule: context.schedule,
    warnings: missingWarnings,
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
