import * as XLSX from "xlsx";
import { getShiftTemplate } from "./data";
import { calculateEmployeeStats } from "./stats";
import { AppState, ShiftType, days } from "./types";

const exportShiftLabels: Record<ShiftType, string> = {
  early: "早班",
  mid: "中班",
  late: "晚班",
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportJsonBackup = (state: AppState) => {
  downloadBlob(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    "auto_shift_scheduler_backup.json",
  );
};

export const exportExcelSchedule = (state: AppState) => {
  const employeeById = new Map(
    state.employees.map((employee) => [employee.id, employee.name]),
  );

  const statsRows = calculateEmployeeStats(state).map((stat) => ({
    Employee: stat.employeeName,
    "Total Hours": Number(stat.totalHours.toFixed(2)),
    "Count Hours": Number(stat.countHours.toFixed(2)),
    "Work Days": stat.workDays,
    "Early Count": stat.earlyCount,
    "Mid Count": stat.midCount,
    "Late Count": stat.lateCount,
  }));

  const workbook = XLSX.utils.book_new();

  days.forEach((day) => {
    const rows = state.schedule[day]
      .filter((assignment) => employeeById.has(assignment.employeeId))
      .map((assignment) => {
        const template = getShiftTemplate(day, assignment.shiftType);
        return [
          employeeById.get(assignment.employeeId) ?? "Unknown",
          `${exportShiftLabels[assignment.shiftType]} ${template.start}-${template.end}`,
        ];
      });

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Employee", "Shift"],
      ...rows,
    ]);
    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, day);
  });

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(statsRows),
    "Employee Statistics",
  );
  XLSX.writeFile(workbook, "weekly_schedule.xlsx");
};
