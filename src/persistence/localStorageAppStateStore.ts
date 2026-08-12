import { loadAppState, saveAppState } from "../storage";
import { AppStateStore } from "./appStateStore";

export const localStorageAppStateStore: AppStateStore = {
  load: loadAppState,
  save: saveAppState,
};
