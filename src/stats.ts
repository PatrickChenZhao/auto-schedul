import { getAssignmentTemplate } from "./data";
import { getHoursBetween } from "./time";
import { AppState, EmployeeStats, days } from "./types";

export const calculateEmployeeStats = (state: AppState): EmployeeStats[] => {
  const stats = state.employees.map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    totalHours: 0,
    countHours: 0,
    workDays: 0,
    earlyCount: 0,
    midCount: 0,
    addCount: 0,
    lateCount: 0,
  }));

  const statByEmployee = new Map(stats.map((stat) => [stat.employeeId, stat]));

  days.forEach((day) => {
    state.schedule[day].forEach((assignment) => {
      const stat = statByEmployee.get(assignment.employeeId);
      if (!stat) return;
      const template = getAssignmentTemplate(day, assignment, state.shiftTemplates);
      const hours = getHoursBetween(template.start, template.end);
      stat.totalHours += hours;
      stat.workDays += 1;
      if (assignment.addTime) {
        stat.addCount += 1;
        stat.countHours += hours;
      } else {
        if (assignment.shiftType === "early") stat.earlyCount += 1;
        if (assignment.shiftType === "mid") stat.midCount += 1;
        if (assignment.shiftType === "late") stat.lateCount += 1;
        stat.countHours += hours - 1;
      }
    });
  });

  return stats.filter(
    (stat) =>
      stat.workDays > 0 ||
      state.employees.find((employee) => employee.id === stat.employeeId)?.enabled,
  );
};
