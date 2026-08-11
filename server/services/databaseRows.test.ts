import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../src/data.js";
import {
  buildConfigurationDatabaseRows,
  buildHistoryAssignmentDatabaseRows,
} from "./databaseRows.js";

describe("database row mappings", () => {
  it("maps configuration rows to the snake_case names consumed by PostgreSQL", () => {
    const state = createDefaultState();
    const [patrick, tom] = state.employees;
    state.preferences[patrick.id].coworkers = [
      { coworkerId: tom.id, type: "hard" },
    ];

    const rows = buildConfigurationDatabaseRows(state);

    expect(rows.employeeRows[0]).toEqual({
      id: patrick.id,
      name: patrick.name,
      type: patrick.type,
      enabled: patrick.enabled,
      sort_order: 0,
      preferred_shift: "any",
      refuse_late_shift: false,
      min_days: 4,
      max_days: 6,
    });
    expect(rows.availabilityRows[0]).toEqual({
      employee_id: patrick.id,
      day: "Monday",
      available: true,
      start_time: "09:45",
      end_time: "23:00",
    });
    expect(rows.coworkerRows).toEqual([
      {
        employee_id: patrick.id,
        coworker_id: tom.id,
        type: "hard",
      },
    ]);
  });

  it("deduplicates coworker rows that share the database primary key", () => {
    const state = createDefaultState();
    const [patrick, tom] = state.employees;
    state.preferences[patrick.id].coworkers = [
      { coworkerId: tom.id, type: "hard" },
      { coworkerId: tom.id, type: "soft" },
    ];

    expect(buildConfigurationDatabaseRows(state).coworkerRows).toEqual([
      {
        employee_id: patrick.id,
        coworker_id: tom.id,
        type: "hard",
      },
    ]);
  });

  it("maps History assignments to the snake_case names consumed by PostgreSQL", () => {
    const state = createDefaultState();
    const employee = state.employees[0];
    state.schedule.Monday = [{ employeeId: employee.id, shiftType: "early" }];

    const rows = buildHistoryAssignmentDatabaseRows({
      weekStart: "2026-08-10",
      schedule: state.schedule,
      settings: state,
      createId: () => "00000000-0000-4000-8000-000000000001",
    });

    expect(rows).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        employee_id: employee.id,
        employee_name: employee.name,
        work_date: "2026-08-10",
        shift_type: "early",
        start_time: "09:45",
        end_time: "19:45",
        calculated_hours: 10,
      },
    ]);
  });
});
