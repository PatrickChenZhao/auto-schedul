import { describe, expect, it } from "vitest";
import { MAX_JSON_BODY_BYTES, readJson } from "./http";

const captureResponse = async (request: Request) => {
  try {
    await readJson(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("Expected readJson to reject.");
};

describe("readJson", () => {
  it("parses an application/json request", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    await expect(readJson(request)).resolves.toEqual({ ok: true });
  });

  it("rejects unsupported content types", async () => {
    const response = await captureResponse(
      new Request("https://example.test/api", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects invalid JSON", async () => {
    const response = await captureResponse(
      new Request("https://example.test/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects bodies larger than one MiB", async () => {
    const response = await captureResponse(
      new Request("https://example.test/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(MAX_JSON_BODY_BYTES) }),
      }),
    );
    expect(response.status).toBe(413);
  });
});
