import { describe, expect, it } from "vitest";
import { createDefaultState } from "./data";
import { calculateEmployeeStats } from "./stats";

describe("employee stats", () => {
  it("counts an ADD as one work day and six total and count hours", () => {
    const state = createDefaultState();
    const employee = state.employees[0];
    state.schedule.Monday = [
      { employeeId: employee.id, shiftType: "mid", addTime: "15:00-21:00" },
    ];

    const stat = calculateEmployeeStats(state).find(
      ({ employeeId }) => employeeId === employee.id,
    );

    expect(stat).toMatchObject({
      earlyCount: 0,
      midCount: 0,
      addCount: 1,
      lateCount: 0,
      workDays: 1,
      totalHours: 6,
      countHours: 6,
    });
  });
});
