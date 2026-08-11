import type { AppSettings, WeeklySchedule } from "../../src/types.js";
import { days } from "../../src/types.js";
import { getHoursBetween } from "../../src/time.js";

export const addUtcDays = (isoDate: string, daysToAdd: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
};

export const buildConfigurationDatabaseRows = (settings: AppSettings) => {
  const employeeRows = settings.employees.map((employee, sortOrder) => {
    const preference = settings.preferences[employee.id];
    return {
      id: employee.id,
      name: employee.name,
      type: employee.type,
      enabled: employee.enabled,
      sort_order: sortOrder,
      preferred_shift: preference.shiftPreference,
      refuse_late_shift: preference.refuseLateShift,
      min_days: preference.minDays,
      max_days: preference.maxDays,
    };
  });

  const availabilityRows = settings.employees.flatMap((employee) =>
    Object.entries(settings.availability[employee.id]).map(([day, entry]) => ({
      employee_id: employee.id,
      day,
      available: entry.available,
      start_time: entry.start,
      end_time: entry.end,
    })),
  );

  const activeEmployeeIds = new Set(settings.employees.map((employee) => employee.id));
  const seenCoworkerRows = new Set<string>();
  const coworkerRows = settings.employees.flatMap((employee) =>
    settings.preferences[employee.id].coworkers.flatMap((preference) => {
      if (!activeEmployeeIds.has(preference.coworkerId)) return [];
      const key = `${employee.id}\u0000${preference.coworkerId}`;
      if (seenCoworkerRows.has(key)) return [];
      seenCoworkerRows.add(key);
      return [{
        employee_id: employee.id,
        coworker_id: preference.coworkerId,
        type: preference.type,
      }];
    }),
  );

  return { employeeRows, availabilityRows, coworkerRows };
};

export const buildHistoryAssignmentDatabaseRows = ({
  weekStart,
  schedule,
  settings,
  createId = () => crypto.randomUUID(),
}: {
  weekStart: string;
  schedule: WeeklySchedule;
  settings: AppSettings;
  createId?: () => string;
}) => {
  const employeeNames = Object.fromEntries(
    settings.employees.map((employee) => [employee.id, employee.name]),
  );
  const activeEmployeeIds = new Set(settings.employees.map((employee) => employee.id));

  return days.flatMap((day, dayIndex) =>
    schedule[day]
      .filter((assignment) => activeEmployeeIds.has(assignment.employeeId))
      .map((assignment) => {
        const template = settings.shiftTemplates[day][assignment.shiftType];
        return {
          id: createId(),
          employee_id: assignment.employeeId,
          employee_name: employeeNames[assignment.employeeId],
          work_date: addUtcDays(weekStart, dayIndex),
          shift_type: assignment.shiftType,
          start_time: template.start,
          end_time: template.end,
          calculated_hours: getHoursBetween(template.start, template.end),
        };
      }),
  );
};
