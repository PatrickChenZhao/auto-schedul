import { getAuthToken } from "./authClient";
import type {
  BootstrapResponse,
  HistoryDetail,
  HistoryListItem,
  SaveConfigurationResponse,
} from "./contracts";
import type { AppSettings, WeeklySchedule } from "../types";
import type { ExcelExportMode } from "../exporters";

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const responseText = await response.text();
    let message = "";
    try {
      const body = JSON.parse(responseText) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      if (responseText && !responseText.trimStart().startsWith("<")) {
        message = responseText.trim();
      }
    }
    throw new Error(message || `Cloud request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
};

export const bootstrapCloudWorkspace = () =>
  request<BootstrapResponse>("/api/cloud?action=bootstrap");

export const saveCloudConfiguration = ({
  workspaceId,
  settings,
  source,
  sourceFingerprint,
}: {
  workspaceId: string;
  settings: AppSettings;
  source: "autosave" | "local-storage-import" | "new-workspace";
  sourceFingerprint?: string;
}) =>
  request<SaveConfigurationResponse>(
    `/api/cloud?action=configuration&workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ settings, source, sourceFingerprint }),
    },
  );

export const saveExportHistory = ({
  workspaceId,
  idempotencyKey,
  weekStart,
  format,
  schedule,
  settingsSnapshot,
}: {
  workspaceId: string;
  idempotencyKey: string;
  weekStart: string;
  format: ExcelExportMode;
  schedule: WeeklySchedule;
  settingsSnapshot: AppSettings;
}) =>
  request<{ id: string }>(
    `/api/cloud?action=history&workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: "POST",
      body: JSON.stringify({ idempotencyKey, weekStart, format, schedule, settingsSnapshot }),
    },
  );

export const fetchHistory = async (workspaceId: string) => {
  const response = await request<{ items: HistoryListItem[] }>(
    `/api/cloud?action=history&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return response.items;
};

export const fetchHistoryDetail = (workspaceId: string, historyId: string) =>
  request<HistoryDetail>(
    `/api/cloud?action=history&workspaceId=${encodeURIComponent(workspaceId)}&historyId=${encodeURIComponent(historyId)}`,
  );
