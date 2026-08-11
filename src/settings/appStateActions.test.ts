import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data";
import {
  addEmployeeToState,
  removeEmployeeFromState,
  setEmployeeTypeInState,
  updateAvailabilityInState,
  updatePreferenceInState,
} from "./appStateActions";

describe("app state settings actions", () => {
  it("adds all scheduling settings required by a new employee", () => {
    const employee = {
      id: "emp-new",
      name: "New Employee",
      type: "casual" as const,
      enabled: true,
    };
    const state = addEmployeeToState(createDefaultState(), employee);

    expect(state.employees[state.employees.length - 1]).toEqual(employee);
    expect(state.availability[employee.id].Monday).toEqual({
      available: true,
      start: "09:45",
      end: "23:00",
    });
    expect(state.preferences[employee.id]).toEqual({
      shiftPreference: "any",
      refuseLateShift: false,
      minDays: 0,
      maxDays: 3,
      coworkers: [],
    });
    expect(state.specialSettings.earlyAllowedEmployeeIds).toContain(employee.id);
  });

  it("preserves the current employee type and availability update semantics", () => {
    const initial = createDefaultState();
    const casual = setEmployeeTypeInState(initial, "emp-patrick", "casual");
    const fullTimeAgain = setEmployeeTypeInState(casual, "emp-patrick", "full-time");
    const unavailable = updateAvailabilityInState(
      fullTimeAgain,
      "emp-patrick",
      "Monday",
      { available: false },
    );

    expect(fullTimeAgain.preferences["emp-patrick"].maxDays).toBe(3);
    expect(unavailable.availability["emp-patrick"].Monday).toEqual({
      available: false,
      start: "09:45",
      end: "23:00",
    });
  });

  it("removes the employee data and current assignments together", () => {
    const initial = updatePreferenceInState(createDefaultState(), "emp-patrick", {
      coworkers: [{ coworkerId: "emp-amy", type: "hard" }],
    });
    initial.schedule.Monday = [{ employeeId: "emp-amy", shiftType: "late" }];

    const state = removeEmployeeFromState(initial, "emp-amy");

    expect(state.employees.some((employee) => employee.id === "emp-amy")).toBe(false);
    expect(state.availability["emp-amy"]).toBeUndefined();
    expect(state.preferences["emp-amy"]).toBeUndefined();
    expect(state.specialSettings.earlyAllowedEmployeeIds).not.toContain("emp-amy");
    expect(state.schedule.Monday).toEqual([]);
    expect(state.preferences["emp-patrick"].coworkers).toEqual([
      { coworkerId: "emp-amy", type: "hard" },
    ]);
  });
});
