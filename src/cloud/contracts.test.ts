import { describe, expect, it } from "vitest";
import { createDefaultState } from "../data";
import { createHistoryRequestSchema, toAppSettings } from "./contracts";

const validRequest = () => {
  const state = createDefaultState();
  return {
    idempotencyKey: crypto.randomUUID(),
    weekStart: "2026-08-10",
    format: "general" as const,
    schedule: state.schedule,
    settingsSnapshot: toAppSettings(state),
  };
};

describe("History export request", () => {
  it("requires a valid idempotency key", () => {
    expect(createHistoryRequestSchema.parse(validRequest()).idempotencyKey).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("rejects a missing idempotency key", () => {
    const { idempotencyKey: _unused, ...request } = validRequest();
    expect(() => createHistoryRequestSchema.parse(request)).toThrow();
  });

  it("accepts an ADD shift time", () => {
    const request = validRequest();
    request.schedule.Monday.push({
      employeeId: request.settingsSnapshot.employees[0].id,
      shiftType: "mid",
      addTime: "15:00-21:00",
    });

    expect(createHistoryRequestSchema.parse(request).schedule.Monday[0].addTime).toBe(
      "15:00-21:00",
    );
  });
});
