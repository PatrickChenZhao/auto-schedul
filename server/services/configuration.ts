import { and, asc, eq, isNull } from "drizzle-orm";
import type { AppSettings } from "../../src/types";
import type {
  BootstrapResponse,
  SaveConfigurationResponse,
} from "../../src/cloud/contracts";
import { appSettingsSchema } from "../../src/cloud/contracts";
import { db, neonSql } from "../db/client";
import {
  employeeAvailability,
  employeeCoworkerPreferences,
  employees,
  rosterSettings,
  workspaceImports,
} from "../db/schema";

const normalizeTime = (value: string) => value.slice(0, 5);

export const loadConfiguration = async (
  workspace: BootstrapResponse["workspace"],
): Promise<BootstrapResponse> => {
  const [employeeRows, availabilityRows, coworkerRows, settingsRows] = await Promise.all([
    db
      .select()
      .from(employees)
      .where(and(eq(employees.workspaceId, workspace.id), isNull(employees.deletedAt)))
      .orderBy(asc(employees.sortOrder)),
    db
      .select()
      .from(employeeAvailability)
      .where(eq(employeeAvailability.workspaceId, workspace.id)),
    db
      .select()
      .from(employeeCoworkerPreferences)
      .where(eq(employeeCoworkerPreferences.workspaceId, workspace.id)),
    db.select().from(rosterSettings).where(eq(rosterSettings.workspaceId, workspace.id)).limit(1),
  ]);

  const settingsRow = settingsRows[0];
  if (!settingsRow) return { workspace, configuration: null };

  const activeIds = new Set(employeeRows.map((employee) => employee.id));
  const availability: AppSettings["availability"] = {};
  const preferences: AppSettings["preferences"] = {};

  for (const employee of employeeRows) {
    availability[employee.id] = {} as AppSettings["availability"][string];
    preferences[employee.id] = {
      shiftPreference: employee.preferredShift,
      refuseLateShift: employee.refuseLateShift,
      minDays: employee.minDays,
      maxDays: employee.maxDays,
      coworkers: coworkerRows
        .filter(
          (preference) =>
            preference.employeeId === employee.id && activeIds.has(preference.coworkerId),
        )
        .map((preference) => ({
          coworkerId: preference.coworkerId,
          type: preference.type,
        })),
    };
  }

  for (const entry of availabilityRows) {
    if (!availability[entry.employeeId]) continue;
    availability[entry.employeeId][entry.day] = {
      available: entry.available,
      start: normalizeTime(entry.startTime),
      end: normalizeTime(entry.endTime),
    };
  }

  const settings = appSettingsSchema.parse({
    employees: employeeRows.map((employee) => ({
      id: employee.id,
      name: employee.name,
      type: employee.type,
      enabled: employee.enabled,
    })),
    availability,
    preferences,
    shiftDemand: settingsRow.shiftDemand,
    shiftTemplates: settingsRow.shiftTemplates,
    specialSettings: settingsRow.specialSettings,
  });

  return {
    workspace,
    configuration: {
      settings,
      revision: settingsRow.revision,
      updatedAt: settingsRow.updatedAt.toISOString(),
    },
  };
};

export const saveConfiguration = async ({
  workspaceId,
  userId,
  settings,
  source,
  sourceFingerprint,
}: {
  workspaceId: string;
  userId: string;
  settings: AppSettings;
  source: "autosave" | "local-storage-import" | "new-workspace";
  sourceFingerprint?: string;
}): Promise<SaveConfigurationResponse> => {
  if (source === "local-storage-import" && sourceFingerprint) {
    const priorImport = await db
      .select({ id: workspaceImports.id })
      .from(workspaceImports)
      .where(
        and(
          eq(workspaceImports.workspaceId, workspaceId),
          eq(workspaceImports.sourceFingerprint, sourceFingerprint),
        ),
      )
      .limit(1);
    if (priorImport[0]) {
      const current = await db
        .select({ revision: rosterSettings.revision, updatedAt: rosterSettings.updatedAt })
        .from(rosterSettings)
        .where(eq(rosterSettings.workspaceId, workspaceId))
        .limit(1);
      if (current[0]) {
        return {
          revision: current[0].revision,
          updatedAt: current[0].updatedAt.toISOString(),
        };
      }
    }
  }

  const employeeRows = settings.employees.map((employee, sortOrder) => {
    const preference = settings.preferences[employee.id];
    return {
      id: employee.id,
      name: employee.name,
      type: employee.type,
      enabled: employee.enabled,
      sortOrder,
      preferredShift: preference.shiftPreference,
      refuseLateShift: preference.refuseLateShift,
      minDays: preference.minDays,
      maxDays: preference.maxDays,
    };
  });
  const availabilityRows = settings.employees.flatMap((employee) =>
    Object.entries(settings.availability[employee.id]).map(([day, entry]) => ({
      employeeId: employee.id,
      day,
      available: entry.available,
      startTime: entry.start,
      endTime: entry.end,
    })),
  );
  const activeEmployeeIds = new Set(settings.employees.map((employee) => employee.id));
  const coworkerRows = settings.employees.flatMap((employee) =>
    settings.preferences[employee.id].coworkers
      .filter((preference) => activeEmployeeIds.has(preference.coworkerId))
      .map((preference) => ({ employeeId: employee.id, ...preference })),
  );

  const transactionQueries = [
    neonSql`
      delete from employee_coworker_preferences where workspace_id = ${workspaceId}
    `,
    neonSql`
      delete from employee_availability where workspace_id = ${workspaceId}
    `,
    neonSql`
      update employees set deleted_at = now(), updated_at = now()
      where workspace_id = ${workspaceId}
    `,
    neonSql`
      insert into employees (
        workspace_id, id, name, type, enabled, sort_order, preferred_shift,
        refuse_late_shift, min_days, max_days, deleted_at, updated_at
      )
      select
        ${workspaceId}, item.id, item.name, item.type::employee_type, item.enabled,
        item.sort_order, item.preferred_shift::shift_preference,
        item.refuse_late_shift, item.min_days, item.max_days, null, now()
      from jsonb_to_recordset(${JSON.stringify(employeeRows)}::jsonb) as item(
        id text, name text, type text, enabled boolean, sort_order integer,
        preferred_shift text, refuse_late_shift boolean, min_days integer, max_days integer
      )
      on conflict (workspace_id, id) do update set
        name = excluded.name,
        type = excluded.type,
        enabled = excluded.enabled,
        sort_order = excluded.sort_order,
        preferred_shift = excluded.preferred_shift,
        refuse_late_shift = excluded.refuse_late_shift,
        min_days = excluded.min_days,
        max_days = excluded.max_days,
        deleted_at = null,
        updated_at = now()
    `,
    neonSql`
      insert into employee_availability (
        workspace_id, employee_id, day, available, start_time, end_time
      )
      select
        ${workspaceId}, item.employee_id, item.day::weekday, item.available,
        item.start_time::time, item.end_time::time
      from jsonb_to_recordset(${JSON.stringify(availabilityRows)}::jsonb) as item(
        employee_id text, day text, available boolean, start_time text, end_time text
      )
    `,
    neonSql`
      insert into employee_coworker_preferences (
        workspace_id, employee_id, coworker_id, type
      )
      select
        ${workspaceId}, item.employee_id, item.coworker_id,
        item.type::coworker_preference_type
      from jsonb_to_recordset(${JSON.stringify(coworkerRows)}::jsonb) as item(
        employee_id text, coworker_id text, type text
      )
    `,
    neonSql`
      insert into roster_settings (
        workspace_id, shift_demand, shift_templates, special_settings,
        revision, updated_by, updated_at
      ) values (
        ${workspaceId}, ${JSON.stringify(settings.shiftDemand)}::jsonb,
        ${JSON.stringify(settings.shiftTemplates)}::jsonb,
        ${JSON.stringify(settings.specialSettings)}::jsonb,
        1, ${userId}, now()
      )
      on conflict (workspace_id) do update set
        shift_demand = excluded.shift_demand,
        shift_templates = excluded.shift_templates,
        special_settings = excluded.special_settings,
        revision = roster_settings.revision + 1,
        updated_by = excluded.updated_by,
        updated_at = now()
    `,
  ];

  if (source === "local-storage-import" && sourceFingerprint) {
    transactionQueries.push(neonSql`
      insert into workspace_imports (
        id, workspace_id, imported_by, source_fingerprint, status
      ) values (
        ${crypto.randomUUID()}, ${workspaceId}, ${userId}, ${sourceFingerprint},
        'completed'::import_status
      )
      on conflict (workspace_id, source_fingerprint) do nothing
    `);
  }

  transactionQueries.push(neonSql`
    select revision, updated_at from roster_settings where workspace_id = ${workspaceId}
  `);

  const results = await neonSql.transaction(transactionQueries);
  const finalResult = results.at(-1) as Array<{ revision: number; updated_at: string | Date }>;
  const saved = finalResult[0];
  if (!saved) throw new Error("Configuration was not saved.");
  return {
    revision: Number(saved.revision),
    updatedAt: new Date(saved.updated_at).toISOString(),
  };
};
