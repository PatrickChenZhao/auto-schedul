import * as XLSX from "xlsx-js-style";
import { getShiftTemplate } from "./data";
import { calculateEmployeeStats } from "./stats";
import { getHoursBetween, timeToMinutes } from "./time";
import { AppState, Day, ShiftType, days } from "./types";

type CellStyle = NonNullable<XLSX.CellObject["s"]>;
export type ExcelExportMode = "general" | "chapanda";

const daySheetNames: Record<Day, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const generalShiftLabels: Record<ShiftType, string> = {
  early: "Early",
  mid: "Mid",
  late: "Late",
};

const titleStyle: CellStyle = {
  font: { name: "Microsoft YaHei", sz: 24, bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "2F5FD3" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } },
  },
};

const baseStyle: CellStyle = {
  font: { name: "Microsoft YaHei", sz: 11, color: { rgb: "000000" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } },
  },
};

const boldStyle: CellStyle = {
  ...baseStyle,
  font: { name: "Microsoft YaHei", sz: 11, bold: true, color: { rgb: "000000" } },
};

const blueHeaderStyle: CellStyle = {
  ...boldStyle,
  fill: { fgColor: { rgb: "B4C7E7" } },
};

const shiftBarStyle: CellStyle = {
  ...baseStyle,
  fill: { fgColor: { rgb: "B4C7E7" } },
};

const noteStyle: CellStyle = {
  ...baseStyle,
  font: { name: "Microsoft YaHei", sz: 11, bold: true, color: { rgb: "FF0000" } },
  alignment: { horizontal: "left", vertical: "center" },
};

const blankStyle: CellStyle = {
  ...baseStyle,
  font: { name: "Microsoft YaHei", sz: 11, color: { rgb: "000000" } },
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const ensureCell = (
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  columnIndex: number,
  value: string | number = "",
) => {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const type = typeof value === "number" ? "n" : "s";
  worksheet[address] = { t: type, v: value };
  return worksheet[address] as XLSX.CellObject;
};

const setCell = (
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  columnIndex: number,
  value: string | number,
  style: CellStyle = baseStyle,
) => {
  const cell = ensureCell(worksheet, rowIndex, columnIndex, value);
  cell.s = style;
};

const styleCell = (
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  columnIndex: number,
  style: CellStyle,
) => {
  const cell = ensureCell(worksheet, rowIndex, columnIndex);
  cell.s = style;
};

const styleRange = (
  worksheet: XLSX.WorkSheet,
  startRow: number,
  startColumn: number,
  endRow: number,
  endColumn: number,
  style: CellStyle,
) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      styleCell(worksheet, row, column, style);
    }
  }
};

const mergeRange = (worksheet: XLSX.WorkSheet, range: string) => {
  worksheet["!merges"] = worksheet["!merges"] ?? [];
  worksheet["!merges"].push(XLSX.utils.decode_range(range));
};

const formatDate = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${day}/${month}`;
};

const getNextMonday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const dayOfWeek = date.getDay();
  const daysUntilMonday = ((8 - dayOfWeek) % 7) || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return date;
};

const addDays = (date: Date, daysToAdd: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  return nextDate;
};

const formatTimePart = (time: string) => {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (minute === 0) return String(hour);
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minuteText}`;
};

const formatShiftTime = (start: string, end: string) =>
  `${formatTimePart(start)}-${formatTimePart(end)}`;

const calculateCountHours = (start: string, end: string) => {
  const hours = getHoursBetween(start, end) - 1;
  return Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
};

const createEmptySheet = (rowCount: number, columnCount: number) =>
  XLSX.utils.aoa_to_sheet(
    Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => "")),
    { sheetStubs: true },
  );

const applyLayout = (worksheet: XLSX.WorkSheet, rowCount: number) => {
  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 5 },
    { wch: 5 },
    ...Array.from({ length: 26 }, () => ({ wch: 3.6 })),
    { wch: 7 },
    { wch: 7 },
  ];

  worksheet["!rows"] = Array.from({ length: rowCount }, (_, index) => {
    if (index === 0) return { hpt: 30 };
    if (index >= 3 && index <= 7) return { hidden: true, hpt: 0 };
    if (index >= 15 && index <= 17) return { hpt: 20 };
    return { hpt: 18 };
  });
};

const buildScheduleSheet = (
  state: AppState,
  day: Day,
  date: Date,
): XLSX.WorkSheet => {
  const totalColumns = 31;
  const displayRowCount = Math.max(state.schedule[day].length, 5);
  const noteStartRow = 10 + displayRowCount;
  const totalRows = Math.max(19, noteStartRow + 4);
  const worksheet = createEmptySheet(totalRows, totalColumns);
  const employeeById = new Map(
    state.employees.map((employee) => [employee.id, employee.name]),
  );

  worksheet["!ref"] = `A1:AE${totalRows}`;
  applyLayout(worksheet, totalRows);

  styleRange(worksheet, 0, 0, totalRows - 1, totalColumns - 1, blankStyle);
  styleRange(worksheet, 0, 0, 0, totalColumns - 1, titleStyle);

  mergeRange(worksheet, "A1:AE1");
  mergeRange(worksheet, "A2:K2");
  mergeRange(worksheet, "L2:AE2");
  mergeRange(worksheet, "AD3:AE3");
  mergeRange(worksheet, "B10:C10");
  mergeRange(worksheet, "D10:AC10");
  mergeRange(worksheet, "AD10:AE10");

  setCell(worksheet, 0, 0, "皇后大街店员工班表", titleStyle);
  setCell(worksheet, 1, 0, `日期:${formatDate(date)}`, boldStyle);
  setCell(worksheet, 1, 11, "目标业绩: 堂食 $5750", boldStyle);
  setCell(worksheet, 2, 0, "营业时段", boldStyle);
  setCell(worksheet, 2, 29, "合计", boldStyle);

  for (let hour = 9; hour <= 22; hour += 1) {
    const startColumn = 1 + (hour - 9) * 2;
    const endColumn = startColumn + 1;
    mergeRange(
      worksheet,
      `${XLSX.utils.encode_col(startColumn)}3:${XLSX.utils.encode_col(endColumn)}3`,
    );
    const style = hour >= 11 && hour <= 21 ? blueHeaderStyle : boldStyle;
    styleRange(worksheet, 2, startColumn, 2, endColumn, style);
    setCell(worksheet, 2, startColumn, String(hour), style);
  }

  setCell(worksheet, 9, 0, "姓名", boldStyle);
  setCell(worksheet, 9, 1, "班次时间", boldStyle);
  setCell(worksheet, 9, 3, "在班时段（吃饭时间包括其中，错峰就餐）", boldStyle);
  setCell(worksheet, 9, 29, "每人合计工时", boldStyle);

  const sortedAssignments = [...state.schedule[day]]
    .filter((assignment) => employeeById.has(assignment.employeeId))
    .sort((first, second) => {
      const firstTemplate = getShiftTemplate(day, first.shiftType);
      const secondTemplate = getShiftTemplate(day, second.shiftType);
      return (
        timeToMinutes(firstTemplate.start) - timeToMinutes(secondTemplate.start) ||
        (employeeById.get(first.employeeId) ?? "").localeCompare(
          employeeById.get(second.employeeId) ?? "",
        )
      );
    });

  for (let rowOffset = 0; rowOffset < displayRowCount; rowOffset += 1) {
    const rowIndex = 10 + rowOffset;
    mergeRange(worksheet, `B${rowIndex + 1}:C${rowIndex + 1}`);
    mergeRange(worksheet, `AD${rowIndex + 1}:AE${rowIndex + 1}`);

    const assignment = sortedAssignments[rowOffset];
    if (!assignment) continue;

    const template = getShiftTemplate(day, assignment.shiftType);
    setCell(worksheet, rowIndex, 0, employeeById.get(assignment.employeeId) ?? "", baseStyle);
    setCell(worksheet, rowIndex, 1, formatShiftTime(template.start, template.end), baseStyle);
    setCell(
      worksheet,
      rowIndex,
      29,
      calculateCountHours(template.start, template.end),
      baseStyle,
    );

    const barStartMinutes = 10 * 60;
    const slotMinutes = 30;
    const slotCount = 26;
    const shiftStart = Math.max(timeToMinutes(template.start), barStartMinutes);
    const shiftEnd = Math.min(timeToMinutes(template.end), barStartMinutes + slotCount * slotMinutes);
    const firstSlot = Math.max(0, Math.floor((shiftStart - barStartMinutes) / slotMinutes));
    const lastSlot = Math.min(slotCount, Math.ceil((shiftEnd - barStartMinutes) / slotMinutes));

    for (let slot = firstSlot; slot < lastSlot; slot += 1) {
      styleCell(worksheet, rowIndex, 3 + slot, shiftBarStyle);
    }
  }

  for (let rowIndex = noteStartRow; rowIndex <= noteStartRow + 2; rowIndex += 1) {
    mergeRange(worksheet, `A${rowIndex + 1}:AE${rowIndex + 1}`);
    styleRange(worksheet, rowIndex, 0, rowIndex, totalColumns - 1, noteStyle);
  }

  setCell(worksheet, noteStartRow, 0, "今日重点事项同步：", noteStyle);
  setCell(worksheet, noteStartRow + 1, 0, "1、 门店离店前，完成店内食包材料货", noteStyle);
  setCell(
    worksheet,
    noteStartRow + 2,
    0,
    "2、 明日所有员工错峰就餐，遇到人员岗位疲劳，可3小时更换一次岗位",
    noteStyle,
  );

  const thirdNoteRow = noteStartRow + 3;
  if (thirdNoteRow < totalRows) {
    mergeRange(worksheet, `A${thirdNoteRow + 1}:AE${thirdNoteRow + 1}`);
    styleRange(worksheet, thirdNoteRow, 0, thirdNoteRow, totalColumns - 1, noteStyle);
    setCell(
      worksheet,
      thirdNoteRow,
      0,
      "3、 检查门店各小料剩余量，库存较多有过期风险的及时上报给涛哥",
      noteStyle,
    );
  }

  return worksheet;
};

const buildGeneralWorkbook = (state: AppState) => {
  const employeeById = new Map(
    state.employees.map((employee) => [employee.id, employee.name]),
  );
  const workbook = XLSX.utils.book_new();

  days.forEach((day) => {
    const rows = state.schedule[day]
      .filter((assignment) => employeeById.has(assignment.employeeId))
      .map((assignment) => {
        const template = getShiftTemplate(day, assignment.shiftType);
        return [
          employeeById.get(assignment.employeeId) ?? "Unknown",
          `${generalShiftLabels[assignment.shiftType]} ${template.start}-${template.end}`,
        ];
      });

    const worksheet = XLSX.utils.aoa_to_sheet([["Employee", "Shift"], ...rows]);
    worksheet["!cols"] = [{ wch: 18 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, day);
  });

  const statsRows = calculateEmployeeStats(state).map((stat) => ({
    Employee: stat.employeeName,
    "Total Hours": Number(stat.totalHours.toFixed(2)),
    "Count Hours": Number(stat.countHours.toFixed(2)),
    "Work Days": stat.workDays,
    "Early Count": stat.earlyCount,
    "Mid Count": stat.midCount,
    "Late Count": stat.lateCount,
  }));

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(statsRows),
    "Employee Statistics",
  );

  return workbook;
};

const buildChapandaWorkbook = (state: AppState) => {
  const workbook = XLSX.utils.book_new();
  const nextMonday = getNextMonday();

  days.forEach((day, index) => {
    XLSX.utils.book_append_sheet(
      workbook,
      buildScheduleSheet(state, day, addDays(nextMonday, index)),
      daySheetNames[day],
    );
  });

  return workbook;
};

export const exportJsonBackup = (state: AppState) => {
  downloadBlob(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    "auto_shift_scheduler_backup.json",
  );
};

export const exportExcelSchedule = (
  state: AppState,
  mode: ExcelExportMode = "chapanda",
) => {
  const workbook =
    mode === "general" ? buildGeneralWorkbook(state) : buildChapandaWorkbook(state);
  XLSX.writeFile(workbook, "weekly_schedule.xlsx", { bookType: "xlsx" });
};
