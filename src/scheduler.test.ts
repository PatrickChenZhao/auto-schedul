import { describe, expect, it } from "vitest";
import { createDefaultState, createEmptySchedule } from "./data";
import {
  autoCompleteScheduleFrom,
  deleteManualShift,
  generateWeeklyScheduleOptions,
  upsertManualShift,
} from "./scheduler";
import { WeeklySchedule, days } from "./types";

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
