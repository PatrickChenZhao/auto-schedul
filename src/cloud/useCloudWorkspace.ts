import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createDefaultState } from "../data";
import type { AppState, AppSettings } from "../types";
import type { ExcelExportMode } from "../exporters";
import type { CloudAuthState } from "../App";
import {
  bootstrapCloudWorkspace,
  fetchHistory,
  fetchHistoryDetail,
  saveCloudConfiguration,
  saveExportHistory,
} from "./api";
import { toAppSettings, type HistoryDetail, type HistoryListItem, type WorkspaceSummary } from "./contracts";

export type CloudStatus = "local" | "signed-out" | "loading" | "ready" | "error";
export type SyncStatus = "local" | "idle" | "saving" | "saved" | "error";

const hashSettings = async (settings: AppSettings) => {
  const bytes = new TextEncoder().encode(JSON.stringify(settings));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const formatLocalIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const useCloudWorkspace = ({
  auth,
  state,
  setState,
}: {
  auth?: CloudAuthState;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}) => {
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(auth?.configured ? "signed-out" : "local");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(auth?.configured ? "idle" : "local");
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [historyItems, setHistoryItems] = useState<HistoryListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const lastSyncedSettingsRef = useRef("");
  const settingsRef = useRef<AppSettings>(toAppSettings(state));
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const bootstrappedUserRef = useRef("");

  const settings = useMemo(() => toAppSettings(state), [
    state.employees,
    state.availability,
    state.preferences,
    state.shiftDemand,
    state.shiftTemplates,
    state.specialSettings,
  ]);
  const settingsJson = useMemo(() => JSON.stringify(settings), [settings]);
  const authenticatedUserId = auth?.user?.id ?? "";
  settingsRef.current = settings;

  useEffect(() => {
    if (!auth?.configured) return;
    if (auth.pending) return;
    if (!authenticatedUserId) {
      bootstrappedUserRef.current = "";
      setCloudStatus("signed-out");
      setSyncStatus("idle");
      setWorkspace(null);
      setMigrationRequired(false);
      return;
    }
    if (bootstrappedUserRef.current === authenticatedUserId) return;
    bootstrappedUserRef.current = authenticatedUserId;
    let active = true;
    setCloudStatus("loading");
    setErrorMessage("");
    void bootstrapCloudWorkspace()
      .then((result) => {
        if (!active) return;
        setWorkspace(result.workspace);
        if (result.configuration) {
          const remoteSettings = result.configuration.settings;
          lastSyncedSettingsRef.current = JSON.stringify(remoteSettings);
          setState((current) => ({ ...remoteSettings, schedule: current.schedule }));
          setMigrationRequired(false);
          setSyncStatus("saved");
        } else {
          setMigrationRequired(true);
          setSyncStatus("idle");
        }
        setCloudStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        bootstrappedUserRef.current = "";
        setCloudStatus("error");
        setSyncStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Cloud bootstrap failed.");
      });
    return () => {
      active = false;
    };
  }, [auth?.configured, auth?.pending, authenticatedUserId, setState]);

  const queueConfigurationSave = useCallback(
    (
      nextSettings: AppSettings,
      source: "autosave" | "local-storage-import" | "new-workspace",
      sourceFingerprint?: string,
    ) => {
      if (!workspace) return Promise.reject(new Error("Cloud workspace is not ready."));
      const serialized = JSON.stringify(nextSettings);
      setSyncStatus("saving");
      const operation = saveQueueRef.current
        .catch(() => undefined)
        .then(() =>
          saveCloudConfiguration({
            workspaceId: workspace.id,
            settings: nextSettings,
            source,
            sourceFingerprint,
          }),
        )
        .then((result) => {
          lastSyncedSettingsRef.current = serialized;
          setSyncStatus("saved");
          setErrorMessage("");
          return result;
        })
        .catch((error) => {
          setSyncStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Configuration save failed.");
          throw error;
        });
      saveQueueRef.current = operation;
      return operation;
    },
    [workspace],
  );

  useEffect(() => {
    if (cloudStatus !== "ready" || migrationRequired || !workspace) return;
    if (settingsJson === lastSyncedSettingsRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void queueConfigurationSave(settingsRef.current, "autosave").catch(() => undefined);
    }, 500);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [cloudStatus, migrationRequired, queueConfigurationSave, settingsJson, workspace]);

  const flushConfiguration = useCallback(async () => {
    if (!auth?.configured) return;
    if (!auth.user || !workspace || migrationRequired) {
      throw new Error("Sign in and finish the first cloud setup before exporting.");
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const current = settingsRef.current;
    if (JSON.stringify(current) !== lastSyncedSettingsRef.current) {
      await queueConfigurationSave(current, "autosave");
    } else {
      await saveQueueRef.current;
    }
  }, [auth?.configured, auth?.user, migrationRequired, queueConfigurationSave, workspace]);

  const initializeCloud = useCallback(
    async (choice: "import-local" | "fresh") => {
      if (!workspace) throw new Error("Cloud workspace is not ready.");
      const nextSettings =
        choice === "import-local" ? settingsRef.current : toAppSettings(createDefaultState());
      const fingerprint = choice === "import-local" ? await hashSettings(nextSettings) : undefined;
      await queueConfigurationSave(
        nextSettings,
        choice === "import-local" ? "local-storage-import" : "new-workspace",
        fingerprint,
      );
      if (choice === "fresh") {
        setState((current) => ({ ...nextSettings, schedule: current.schedule }));
      }
      setMigrationRequired(false);
      setCloudStatus("ready");
    },
    [queueConfigurationSave, setState, workspace],
  );

  const createExportHistory = useCallback(
    async (weekStart: Date, format: ExcelExportMode, snapshot: AppState) => {
      if (!workspace) throw new Error("Cloud workspace is not ready.");
      await flushConfiguration();
      const result = await saveExportHistory({
        workspaceId: workspace.id,
        idempotencyKey: crypto.randomUUID(),
        weekStart: formatLocalIsoDate(weekStart),
        format,
        schedule: snapshot.schedule,
        settingsSnapshot: toAppSettings(snapshot),
      });
      return result.id;
    },
    [flushConfiguration, workspace],
  );

  const refreshHistory = useCallback(async () => {
    if (!workspace) return [];
    setHistoryLoading(true);
    try {
      const items = await fetchHistory(workspace.id);
      setHistoryItems(items);
      return items;
    } finally {
      setHistoryLoading(false);
    }
  }, [workspace]);

  const loadHistoryDetail = useCallback(
    (historyId: string): Promise<HistoryDetail> => {
      if (!workspace) return Promise.reject(new Error("Cloud workspace is not ready."));
      return fetchHistoryDetail(workspace.id, historyId);
    },
    [workspace],
  );

  return {
    cloudStatus,
    syncStatus,
    workspace,
    migrationRequired,
    errorMessage,
    initializeCloud,
    flushConfiguration,
    createExportHistory,
    historyItems,
    historyLoading,
    refreshHistory,
    loadHistoryDetail,
  };
};
