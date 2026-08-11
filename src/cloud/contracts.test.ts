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
});
