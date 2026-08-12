import { useEffect, useState } from "react";
import { localStorageAppStateStore } from "../persistence/localStorageAppStateStore";
import { AppState } from "../types";
import { AppStateStore } from "../persistence/appStateStore";

export const usePersistentAppState = (
  store: AppStateStore = localStorageAppStateStore,
) => {
  const [state, setState] = useState<AppState>(() => store.load());

  useEffect(() => {
    store.save(state);
  }, [state, store]);

  return [state, setState] as const;
};
