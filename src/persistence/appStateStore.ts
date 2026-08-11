import { AppState } from "../types";

export type AppStateStore = {
  load: () => AppState;
  save: (state: AppState) => void;
};
