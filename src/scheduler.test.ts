import { describe, expect, it } from "vitest";
import { createDefaultState, createEmptySchedule } from "./data";
import {
  autoCompleteScheduleFrom,
  deleteManualShift,
  generateWeeklyScheduleOptions,
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
        start: "09:45",
        end: "23:00",
      };
    });
    state.schedule = upsertManualShift(createEmptySchedule(), "Monday", {
      employeeId: zhaoChen.id,
      shiftType: "early",
    });

    return { state, zhaoChen, sunFeiyu, otherEmployee };
  };

  it("slightly prefers scheduling 赵宸 and 孙菲雨 on the same day", () => {
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
});
