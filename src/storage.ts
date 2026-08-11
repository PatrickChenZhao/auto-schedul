import { createDefaultState } from "./data";
import { normalizeAppState } from "./persistence/normalizeAppState";
import { AppState } from "./types";

const STORAGE_KEY = "auto-shift-scheduler:app-state";

export const loadAppState = (): AppState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultState();
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeAppState(parsed);
  } catch {
    return createDefaultState();
  }
};

export const saveAppState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export { normalizeAppState } from "./persistence/normalizeAppState";
