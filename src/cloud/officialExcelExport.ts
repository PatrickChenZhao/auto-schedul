import type { PreparedExcelExport } from "../exporters";

export const completeOfficialExcelExport = async ({
  prepared,
  saveHistory,
  download,
}: {
  prepared: PreparedExcelExport;
  saveHistory?: () => Promise<unknown>;
  download: (prepared: PreparedExcelExport) => void;
}) => {
  if (saveHistory) await saveHistory();
  download(prepared);
};
