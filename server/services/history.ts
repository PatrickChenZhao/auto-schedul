import { and, asc, count, desc, eq } from "drizzle-orm";
import type {
  HistoryAssignment,
  HistoryDetail,
  HistoryListItem,
} from "../../src/cloud/contracts.js";
import type { AppSettings, Day, EmployeeStats, WeeklySchedule } from "../../src/types.js";
import { days } from "../../src/types.js";
import { db, neonSql } from "../db/client.js";
import { scheduleAssignments, schedules } from "../db/schema.js";
import {
  addUtcDays,
  buildHistoryAssignmentDatabaseRows,
} from "./databaseRows.js";

const buildStats = (
  settings: AppSettings,
  assignments: HistoryAssignment[],
): EmployeeStats[] => {
  const stats = settings.employees.map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    totalHours: 0,
    countHours: 0,
    workDays: 0,
    earlyCount: 0,
    midCount: 0,
    lateCount: 0,
  }));
  const byEmployee = new Map(stats.map((stat) => [stat.employeeId, stat]));
  for (const assignment of assignments) {
    const stat = byEmployee.get(assignment.employeeId);
    if (!stat) continue;
    stat.totalHours += assignment.calculatedHours;
    stat.workDays += 1;
    stat[`${assignment.shiftType}Count`] += 1;
  }
  for (const stat of stats) stat.countHours = stat.totalHours - stat.workDays;
  return stats.filter(
    (stat) =>
      stat.workDays > 0 ||
      settings.employees.find((employee) => employee.id === stat.employeeId)?.enabled,
  );
};

export const createHistoryFromExcelExport = async ({
  workspaceId,
  userId,
  weekStart,
  format,
  schedule,
  settings,
}: {
  workspaceId: string;
  userId: string;
  weekStart: string;
  format: "general" | "chapanda";
  schedule: WeeklySchedule;
  settings: AppSettings;
}) => {
  const scheduleId = crypto.randomUUID();
  const weekEnd = addUtcDays(weekStart, 6);
  const employeeNames = Object.fromEntries(
    settings.employees.map((employee) => [employee.id, employee.name]),
  );
  const assignmentRows = buildHistoryAssignmentDatabaseRows({
    weekStart,
    schedule,
    settings,
  });

  const scheduleSnapshot = { schedule, employeeNames };
  await neonSql.transaction([
    neonSql`
      insert into schedules (
        id, workspace_id, week_start, week_end, schedule_snapshot,
        settings_snapshot, history_trigger, export_format, created_by
      ) values (
        ${scheduleId}, ${workspaceId}, ${weekStart}::date, ${weekEnd}::date,
        ${JSON.stringify(scheduleSnapshot)}::jsonb,
        ${JSON.stringify(settings)}::jsonb,
        'excel-export'::history_trigger, ${format}::export_format, ${userId}
      )
    `,
    neonSql`
      insert into schedule_assignments (
        id, workspace_id, schedule_id, employee_id, employee_name_snapshot, work_date,
        shift_type, start_time, end_time, calculated_hours
      )
      select
        item.id::uuid, ${workspaceId}, ${scheduleId}, item.employee_id, item.employee_name,
        item.work_date::date, item.shift_type::shift_type,
        item.start_time::time, item.end_time::time, item.calculated_hours::numeric
      from jsonb_to_recordset(${JSON.stringify(assignmentRows)}::jsonb) as item(
        id text, employee_id text, employee_name text, work_date text,
        shift_type text, start_time text, end_time text, calculated_hours numeric
      )
    `,
  ]);

  return { id: scheduleId };
};

export const listHistory = async (
  workspaceId: string,
  limit = 50,
): Promise<HistoryListItem[]> => {
  const rows = await db
    .select({
      id: schedules.id,
      weekStart: schedules.weekStart,
      weekEnd: schedules.weekEnd,
      format: schedules.format,
      createdAt: schedules.createdAt,
      createdBy: schedules.createdBy,
      assignmentCount: count(scheduleAssignments.id),
    })
    .from(schedules)
    .leftJoin(scheduleAssignments, eq(scheduleAssignments.scheduleId, schedules.id))
    .where(eq(schedules.workspaceId, workspaceId))
    .groupBy(schedules.id)
    .orderBy(desc(schedules.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    assignmentCount: Number(row.assignmentCount),
  }));
};

export const getHistoryDetail = async (
  workspaceId: string,
  scheduleId: string,
): Promise<HistoryDetail> => {
  const scheduleRows = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, scheduleId), eq(schedules.workspaceId, workspaceId)))
    .limit(1);
  const schedule = scheduleRows[0];
  if (!schedule) throw new Response("History record not found.", { status: 404 });

  const assignmentRows = await db
    .select()
    .from(scheduleAssignments)
    .where(eq(scheduleAssignments.scheduleId, scheduleId))
    .orderBy(asc(scheduleAssignments.workDate), asc(scheduleAssignments.startTime));
  const dayByDate = new Map(
    days.map((day, index) => [addUtcDays(schedule.weekStart, index), day]),
  );
  const assignments: HistoryAssignment[] = assignmentRows.map((assignment) => ({
    employeeId: assignment.employeeId,
    employeeName: assignment.employeeName,
    workDate: assignment.workDate,
    day: dayByDate.get(assignment.workDate) ?? ("Monday" as Day),
    shiftType: assignment.shiftType,
    startTime: assignment.startTime.slice(0, 5),
    endTime: assignment.endTime.slice(0, 5),
    calculatedHours: Number(assignment.calculatedHours),
  }));

  return {
    id: schedule.id,
    weekStart: schedule.weekStart,
    weekEnd: schedule.weekEnd,
    format: schedule.format,
    createdAt: schedule.createdAt.toISOString(),
    createdBy: schedule.createdBy,
    assignmentCount: assignments.length,
    scheduleSnapshot: schedule.scheduleSnapshot,
    settingsSnapshot: schedule.settingsSnapshot,
    assignments,
    stats: buildStats(schedule.settingsSnapshot, assignments),
  };
};
