import { describe, expect, it, vi } from "vitest";
import { completeOfficialExcelExport } from "./officialExcelExport";

const prepared = {
  blob: new Blob(["workbook"]),
  fileName: "schedule.xlsx",
};

describe("official Excel export History boundary", () => {
  it("saves History before starting the download", async () => {
    const calls: string[] = [];
    await completeOfficialExcelExport({
      prepared,
      saveHistory: async () => {
        calls.push("history");
      },
      download: () => calls.push("download"),
    });
    expect(calls).toEqual(["history", "download"]);
  });

  it("does not download when History cannot be saved", async () => {
    const download = vi.fn();
    await expect(
      completeOfficialExcelExport({
        prepared,
        saveHistory: async () => {
          throw new Error("database unavailable");
        },
        download,
      }),
    ).rejects.toThrow("database unavailable");
    expect(download).not.toHaveBeenCalled();
  });

  it("preserves local-only export when cloud is not configured", async () => {
    const download = vi.fn();
    await completeOfficialExcelExport({ prepared, download });
    expect(download).toHaveBeenCalledWith(prepared);
  });
});
