import { AppState, SchedulingInput } from "../types";

export const toSchedulingInput = (state: AppState): SchedulingInput => ({
  employees: state.employees,
  availability: state.availability,
  preferences: state.preferences,
  shiftDemand: state.shiftDemand,
  shiftTemplates: state.shiftTemplates,
  specialSettings: state.specialSettings,
});
