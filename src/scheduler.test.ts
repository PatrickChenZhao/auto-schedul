import { describe, expect, it } from "vitest";
import { createDefaultState, createEmptySchedule } from "./data";
import {
  autoCompleteScheduleFrom,
  deleteManualShift,
  generateWeeklyScheduleOptions,
  hasExcludedSameDayPair,
  internalSchedulerFeatureFlags,
  upsertManualShift,
} from "./scheduler";
import { WeeklySchedule, days, shiftTypes } from "./types";

const scheduleSignature = (schedule: WeeklySchedule) =>
  days
    .map((day) =>
      schedule[day]
        .map((assignment) => `${assignment.employeeId}:${assignment.shiftType}`)
        .join(","),
    )
    .join("|");

describe("scheduler characterization", () => {
  it("keeps the current default schedule options stable", () => {
    const options = generateWeeklyScheduleOptions(createDefaultState(), 5);

    expect(options.map((option) => scheduleSignature(option.schedule))).toEqual([
      "emp-patrick:early,emp-amy:mid,emp-tom:late|emp-john:early,emp-patrick:mid,emp-tom:late|emp-patrick:early,emp-tom:mid,emp-amy:late|emp-tom:early,emp-patrick:mid,emp-john:late|emp-patrick:early,emp-tom:mid|emp-tom:early,emp-patrick:mid|emp-amy:early,emp-john:mid",
      "emp-patrick:early,emp-tom:mid,emp-amy:late|emp-patrick:early,emp-amy:mid,emp-tom:late|emp-john:early,emp-patrick:mid,emp-tom:late|emp-tom:early,emp-patrick:mid,emp-john:late|emp-amy:early,emp-patrick:mid|emp-patrick:early,emp-tom:mid|emp-tom:early,emp-john:mid",
      "emp-patrick:early,emp-tom:mid,emp-amy:late|emp-tom:early,emp-amy:mid,emp-patrick:late|emp-john:early,emp-tom:mid,emp-patrick:late|emp-tom:early,emp-patrick:mid,emp-john:late|emp-patrick:early,emp-tom:mid|emp-tom:early,emp-patrick:mid|emp-amy:early,emp-john:mid",
      "emp-patrick:early,emp-tom:mid,emp-john:late|emp-amy:early,emp-patrick:mid,emp-tom:late|emp-tom:early,emp-john:mid,emp-patrick:late|emp-patrick:early,emp-tom:mid|emp-john:early,emp-patrick:mid|emp-patrick:early,emp-tom:mid,emp-amy:late|emp-tom:early,emp-amy:mid",
      "emp-patrick:early,emp-tom:mid,emp-john:late|emp-tom:early,emp-patrick:mid,emp-amy:late|emp-patrick:early,emp-john:mid|emp-tom:early,emp-amy:mid,emp-patrick:late|emp-patrick:early,emp-tom:mid|emp-john:early,emp-patrick:mid,emp-tom:late|emp-amy:early,emp-tom:mid",
    ]);
    expect(
      options.map((option) =>
        option.warnings.map((warning) => `${warning.type}:${warning.message}`),
      ),
    ).toEqual([
      [
        "missing:Friday - Late Shift: 2 persons missing",
        "missing:Saturday - Late Shift: 3 persons missing",
        "missing:Sunday - Late Shift: 2 persons missing",
      ],
      [
        "missing:Friday - Late Shift: 2 persons missing",
        "missing:Saturday - Late Shift: 3 persons missing",
        "missing:Sunday - Late Shift: 2 persons missing",
      ],
      [
        "missing:Friday - Late Shift: 2 persons missing",
        "missing:Saturday - Late Shift: 3 persons missing",
        "missing:Sunday - Late Shift: 2 persons missing",
      ],
      [
        "missing:Thursday - Late Shift: 1 person missing",
        "missing:Friday - Late Shift: 2 persons missing",
        "missing:Saturday - Late Shift: 2 persons missing",
        "missing:Sunday - Late Shift: 2 persons missing",
      ],
      [
        "missing:Wednesday - Late Shift: 1 person missing",
        "missing:Friday - Late Shift: 2 persons missing",
        "missing:Saturday - Late Shift: 2 persons missing",
        "missing:Sunday - Late Shift: 2 persons missing",
      ],
    ]);
  });

  it("keeps the current auto-complete behavior stable", () => {
    const state = createDefaultState();
    state.schedule = upsertManualShift(createEmptySchedule(), "Monday", {
      employeeId: "emp-amy",
      shiftType: "late",
    });

    const result = autoCompleteScheduleFrom(state, state.schedule);

    expect(scheduleSignature(result.schedule)).toBe(
      "emp-patrick:early,emp-tom:mid,emp-amy:late|emp-tom:early,emp-patrick:mid,emp-john:late|emp-patrick:early,emp-tom:mid,emp-amy:late|emp-tom:early,emp-patrick:mid,emp-john:late|emp-patrick:early,emp-tom:mid|emp-tom:early,emp-patrick:mid|emp-john:early,emp-amy:mid",
    );
    expect(result.warnings).toEqual([
      { type: "missing", message: "星期五-晚班缺人-无法补全" },
      { type: "missing", message: "星期六-晚班缺人-无法补全" },
      { type: "missing", message: "星期日-晚班缺人-无法补全" },
    ]);
  });

  it("keeps manual upsert and delete semantics stable", () => {
    const initial = createEmptySchedule();
    const added = upsertManualShift(initial, "Tuesday", {
      employeeId: "emp-patrick",
      shiftType: "early",
    });
    const replaced = upsertManualShift(added, "Tuesday", {
      employeeId: "emp-patrick",
      shiftType: "late",
    });

    expect(replaced.Tuesday).toEqual([
      { employeeId: "emp-patrick", shiftType: "late" },
    ]);
    expect(deleteManualShift(replaced, "Tuesday", "emp-patrick").Tuesday).toEqual([]);

    const addShift = {
      employeeId: "emp-patrick",
      shiftType: "mid" as const,
      addTime: "15:00-21:00" as const,
    };
    const regularAfterAdd = upsertManualShift(
      { ...initial, Tuesday: [addShift] },
      "Tuesday",
      { employeeId: "emp-patrick", shiftType: "early" },
    );
    expect(regularAfterAdd.Tuesday).toEqual([
      { employeeId: "emp-patrick", shiftType: "early" },
    ]);
  });
});

describe("internal named-employee soft constraint", () => {
  const createNamedPairState = () => {
    const state = createDefaultState();
    const [zhaoChen, sunFeiyu, otherEmployee] = state.employees;

    zhaoChen.name = "赵宸";
    sunFeiyu.name = "孙菲雨";
    otherEmployee.name = "A";
    otherEmployee.type = "full-time";
    state.employees = [zhaoChen, sunFeiyu, otherEmployee];

    state.employees.forEach((employee) => {
      state.preferences[employee.id] = {
        shiftPreference: "any",
        refuseLateShift: false,
        minDays: 0,
        maxDays: 7,
        coworkers: [],
      };
    });

    days.forEach((day) => {
      shiftTypes.forEach((shiftType) => {
        state.shiftDemand[day][shiftType] = 0;
      });
      state.employees.forEach((employee) => {
        state.availability[employee.id][day].available = false;
      });
    });

    state.shiftDemand.Monday.early = 1;
    state.shiftDemand.Monday.mid = 1;
    state.employees.forEach((employee) => {
      state.availability[employee.id].Monday = {
        available: true,
        start: "09:30",
        end: "23:00",
      };
    });
    state.schedule = upsertManualShift(createEmptySchedule(), "Monday", {
      employeeId: zhaoChen.id,
      shiftType: "early",
    });

    return { state, zhaoChen, sunFeiyu, otherEmployee };
  };

  it("prefers scheduling 赵宸 and 孙菲雨 on the same day", () => {
    const { state, sunFeiyu } = createNamedPairState();

    const result = autoCompleteScheduleFrom(state, state.schedule);

    expect(result.schedule.Monday).toContainEqual({
      employeeId: sunFeiyu.id,
      shiftType: "mid",
    });
  });

  it("does not force the pair when one employee is unavailable", () => {
    const { state, sunFeiyu, otherEmployee } = createNamedPairState();
    state.availability[sunFeiyu.id].Monday.available = false;

    const result = autoCompleteScheduleFrom(state, state.schedule);

    expect(result.schedule.Monday).toContainEqual({
      employeeId: otherEmployee.id,
      shiftType: "mid",
    });
    expect(result.warnings).toEqual([]);
  });

  it("repeatedly repairs a generated schedule with feasible cross-day swaps", () => {
    const { state, zhaoChen, sunFeiyu, otherEmployee } = createNamedPairState();
    state.shiftDemand.Tuesday.early = 1;
    state.shiftDemand.Wednesday.mid = 1;
    state.shiftDemand.Thursday.early = 1;
    state.shiftDemand.Thursday.mid = 1;
    (["Tuesday", "Wednesday", "Thursday"] as const).forEach((day) => {
      state.availability[sunFeiyu.id][day] = {
        available: true,
        start: "09:30",
        end: "23:00",
      };
      state.availability[otherEmployee.id][day] = {
        available: true,
        start: "09:30",
        end: "23:00",
      };
    });
    state.availability[zhaoChen.id].Thursday = {
      available: true,
      start: "09:30",
      end: "23:00",
    };
    state.schedule = upsertManualShift(createEmptySchedule(), "Monday", {
      employeeId: zhaoChen.id,
      shiftType: "early",
    });
    state.schedule = upsertManualShift(state.schedule, "Monday", {
      employeeId: otherEmployee.id,
      shiftType: "mid",
    });
    state.schedule = upsertManualShift(state.schedule, "Tuesday", {
      employeeId: sunFeiyu.id,
      shiftType: "early",
    });
    state.schedule = upsertManualShift(state.schedule, "Wednesday", {
      employeeId: sunFeiyu.id,
      shiftType: "mid",
    });
    state.schedule = upsertManualShift(state.schedule, "Thursday", {
      employeeId: zhaoChen.id,
      shiftType: "early",
    });
    state.schedule = upsertManualShift(state.schedule, "Thursday", {
      employeeId: otherEmployee.id,
      shiftType: "mid",
    });

    const result = autoCompleteScheduleFrom(state, state.schedule);

    expect(result.schedule.Monday).toContainEqual({
      employeeId: sunFeiyu.id,
      shiftType: "mid",
    });
    expect(result.schedule.Tuesday).toContainEqual({
      employeeId: otherEmployee.id,
      shiftType: "early",
    });
    expect(result.schedule.Thursday).toContainEqual({
      employeeId: sunFeiyu.id,
      shiftType: "mid",
    });
    expect(result.schedule.Wednesday).toContainEqual({
      employeeId: otherEmployee.id,
      shiftType: "mid",
    });
  });

  it("disables the named-pair repair when the internal feature flag is false", () => {
    const { state, zhaoChen, sunFeiyu, otherEmployee } = createNamedPairState();
    state.shiftDemand.Tuesday.early = 1;
    state.availability[sunFeiyu.id].Tuesday = {
      available: true,
      start: "09:30",
      end: "23:00",
    };
    state.availability[otherEmployee.id].Tuesday = {
      available: true,
      start: "09:30",
      end: "23:00",
    };
    state.schedule = upsertManualShift(createEmptySchedule(), "Monday", {
      employeeId: zhaoChen.id,
      shiftType: "early",
    });
    state.schedule = upsertManualShift(state.schedule, "Monday", {
      employeeId: otherEmployee.id,
      shiftType: "mid",
    });
    state.schedule = upsertManualShift(state.schedule, "Tuesday", {
      employeeId: sunFeiyu.id,
      shiftType: "early",
    });

    internalSchedulerFeatureFlags.preferZhaoChenAndSunFeiyuSameDay = false;
    try {
      const result = autoCompleteScheduleFrom(state, state.schedule);

      expect(result.schedule.Monday).toContainEqual({
        employeeId: otherEmployee.id,
        shiftType: "mid",
      });
      expect(result.schedule.Tuesday).toContainEqual({
        employeeId: sunFeiyu.id,
        shiftType: "early",
      });
    } finally {
      internalSchedulerFeatureFlags.preferZhaoChenAndSunFeiyuSameDay = true;
    }
  });
});

describe("赵宸 and 徐嘉程 same-day option exclusion", () => {
  const createExcludedPairState = () => {
    const state = createDefaultState();
    const [zhaoChen, xuJiacheng, otherEmployee] = state.employees;

    zhaoChen.name = "赵宸";
    xuJiacheng.name = "徐嘉程";
    otherEmployee.name = "A";
    state.employees = [zhaoChen, xuJiacheng, otherEmployee];

    state.employees.forEach((employee) => {
      state.preferences[employee.id] = {
        shiftPreference: "any",
        refuseLateShift: false,
        minDays: 0,
        maxDays: 7,
        coworkers: [],
      };
    });

    days.forEach((day) => {
      shiftTypes.forEach((shiftType) => {
        state.shiftDemand[day][shiftType] = 0;
      });
    });
    state.shiftDemand.Monday.early = 1;
    state.shiftDemand.Monday.mid = 1;

    return { state, zhaoChen, xuJiacheng };
  };

  it("removes every generated option where the named employees share a day", () => {
    const { state, zhaoChen, xuJiacheng } = createExcludedPairState();

    const options = generateWeeklyScheduleOptions(state, 5);

    expect(options.length).toBeGreaterThan(0);
    options.forEach((option) => {
      expect(
        days.some(
          (day) =>
            option.schedule[day].some(
              (assignment) => assignment.employeeId === zhaoChen.id,
            ) &&
            option.schedule[day].some(
              (assignment) => assignment.employeeId === xuJiacheng.id,
            ),
        ),
      ).toBe(false);
    });
  });

  it("returns no option when every completed schedule contains the excluded pair", () => {
    const { state, zhaoChen, xuJiacheng } = createExcludedPairState();
    state.employees = [zhaoChen, xuJiacheng];

    expect(generateWeeklyScheduleOptions(state, 5)).toEqual([]);
  });

  it("also detects a same-day conflict introduced by an additional assignment", () => {
    const { state, zhaoChen, xuJiacheng } = createExcludedPairState();
    const schedule = createEmptySchedule();
    schedule.Monday = [
      { employeeId: zhaoChen.id, shiftType: "early" },
      {
        employeeId: xuJiacheng.id,
        shiftType: "mid",
        addTime: "15:00-21:00",
      },
    ];

    expect(hasExcludedSameDayPair(state, schedule)).toBe(true);
  });
});
