import { Dispatch, SetStateAction, useState } from "react";
import { createEmptySchedule } from "../data";
import {
  autoCompleteScheduleFrom,
  deleteManualShift,
  generateWeeklyScheduleOptions,
  upsertManualShift,
} from "../scheduler";
import {
  AppState,
  Day,
  ScheduleOption,
  ScheduleWarning,
  ShiftAssignment,
  ShiftType,
} from "../types";
import { toSchedulingInput } from "../settings/toSchedulingInput";

export const useScheduleWorkspace = (
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>,
) => {
  const [warnings, setWarnings] = useState<ScheduleWarning[]>([]);
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([]);
  const [selectedScheduleOptionId, setSelectedScheduleOptionId] = useState("");

  const clearScheduleOptions = () => {
    setScheduleOptions([]);
    setSelectedScheduleOptionId("");
  };

  const updateState = (recipe: (current: AppState) => AppState) => {
    clearScheduleOptions();
    setState((current) => recipe(current));
  };

  const replaceState = (nextState: AppState) => {
    clearScheduleOptions();
    setState(nextState);
  };

  const runAutoSchedule = () => {
    const options = generateWeeklyScheduleOptions(toSchedulingInput(state), 5);
    const bestOption = options[0];
    setScheduleOptions(options);
    setSelectedScheduleOptionId(bestOption?.id ?? "");
    setState((current) => ({
      ...current,
      schedule: bestOption?.schedule ?? createEmptySchedule(),
    }));
    setWarnings(
      bestOption?.warnings.length
        ? bestOption.warnings
        : [{ type: "fallback", message: "Schedule generated successfully." }],
    );
  };

  const selectScheduleOption = (option: ScheduleOption) => {
    setSelectedScheduleOptionId(option.id);
    setState((current) => ({ ...current, schedule: option.schedule }));
    setWarnings(option.warnings);
  };

  const autoCompleteCurrentSchedule = () => {
    clearScheduleOptions();
    const result = autoCompleteScheduleFrom(
      toSchedulingInput(state),
      state.schedule,
    );
    setState((current) => ({ ...current, schedule: result.schedule }));
    setWarnings(result.warnings);
  };

  const startManualSchedule = () => {
    clearScheduleOptions();
    setState((current) => ({ ...current, schedule: createEmptySchedule() }));
  };

  const upsertManualAssignment = (
    day: Day,
    assignment: ShiftAssignment,
  ) => {
    clearScheduleOptions();
    setState((current) => ({
      ...current,
      schedule: upsertManualShift(current.schedule, day, assignment),
    }));
  };

  const changeManualAssignmentShift = (
    day: Day,
    assignment: ShiftAssignment,
    shiftType: ShiftType,
  ) => upsertManualAssignment(day, { ...assignment, shiftType });

  const deleteManualAssignment = (day: Day, employeeId: string) => {
    clearScheduleOptions();
    setState((current) => ({
      ...current,
      schedule: deleteManualShift(current.schedule, day, employeeId),
    }));
  };

  return {
    warnings,
    setWarnings,
    scheduleOptions,
    selectedScheduleOptionId,
    updateState,
    replaceState,
    runAutoSchedule,
    selectScheduleOption,
    autoCompleteCurrentSchedule,
    startManualSchedule,
    upsertManualAssignment,
    changeManualAssignmentShift,
    deleteManualAssignment,
  };
};
