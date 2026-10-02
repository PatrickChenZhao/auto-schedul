import { Dispatch, SetStateAction, useState } from "react";
import { createEmptySchedule } from "../data";
import {
  autoCompleteScheduleFrom,
  deleteManualShift,
  generateWeeklyScheduleOptions,
  hasExcludedSameDayPair,
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

  const additionalAssignments = (schedule: AppState["schedule"]) =>
    Object.fromEntries(
      Object.entries(schedule).map(([day, assignments]) => [
        day,
        assignments.filter((assignment) => assignment.addTime),
      ]),
    ) as AppState["schedule"];

  const regularAssignments = (schedule: AppState["schedule"]) =>
    Object.fromEntries(
      Object.entries(schedule).map(([day, assignments]) => [
        day,
        assignments.filter((assignment) => !assignment.addTime),
      ]),
    ) as AppState["schedule"];

  const mergeAdditionalAssignments = (
    schedule: AppState["schedule"],
    additions: AppState["schedule"],
  ) =>
    Object.fromEntries(
      Object.entries(schedule).map(([day, assignments]) => [
        day,
        [...assignments, ...additions[day as Day]],
      ]),
    ) as AppState["schedule"];

  const updateState = (recipe: (current: AppState) => AppState) => {
    clearScheduleOptions();
    setState((current) => recipe(current));
  };

  const replaceState = (nextState: AppState) => {
    clearScheduleOptions();
    setState(nextState);
  };

  const runAutoSchedule = () => {
    const additions = additionalAssignments(state.schedule);
    const schedulingInput = toSchedulingInput(state);
    const options = generateWeeklyScheduleOptions(schedulingInput, 5)
      .map((option) => ({
        ...option,
        schedule: mergeAdditionalAssignments(option.schedule, additions),
      }))
      .filter(
        (option) => !hasExcludedSameDayPair(schedulingInput, option.schedule),
      )
      .map((option, index) => ({
        ...option,
        id: `schedule-option-${index + 1}`,
        label: `方案 ${index + 1}`,
      }));
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
      regularAssignments(state.schedule),
    );
    const additions = additionalAssignments(state.schedule);
    setState((current) => ({
      ...current,
      schedule: mergeAdditionalAssignments(result.schedule, additions),
    }));
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

  const addAdditionalAssignment = (day: Day, assignment: ShiftAssignment) => {
    clearScheduleOptions();
    setState((current) => {
      if (
        current.schedule[day].some(
          (item) => item.employeeId === assignment.employeeId,
        )
      ) {
        return current;
      }
      return {
        ...current,
        schedule: {
          ...current.schedule,
          [day]: [...current.schedule[day], assignment],
        },
      };
    });
  };

  const deleteManualAssignment = (day: Day, employeeId: string) => {
    clearScheduleOptions();
    setState((current) => ({
      ...current,
      schedule: deleteManualShift(current.schedule, day, employeeId),
    }));
  };

  const deleteAdditionalAssignment = (day: Day, employeeId: string) => {
    clearScheduleOptions();
    setState((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        [day]: current.schedule[day].filter(
          (assignment) => assignment.employeeId !== employeeId || !assignment.addTime,
        ),
      },
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
    addAdditionalAssignment,
    deleteManualAssignment,
    deleteAdditionalAssignment,
  };
};
