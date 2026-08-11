import { and, asc, eq } from "drizzle-orm";
import type { AuthenticatedUser } from "../auth.js";
import { db, neonSql } from "../db/client.js";
import { workspaceMembers, workspaces } from "../db/schema.js";
import type { WorkspaceSummary } from "../../src/cloud/contracts.js";

export const ensurePersonalWorkspace = async (
  user: AuthenticatedUser,
): Promise<WorkspaceSummary> => {
  const existing = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, user.id))
    .orderBy(asc(workspaces.createdAt))
    .limit(1);

  if (existing[0]) return existing[0];

  const workspaceId = crypto.randomUUID();
  const workspaceName = user.name?.trim()
    ? `${user.name.trim()}'s Workspace`
    : "My Workspace";

  const created = await neonSql`
    with selected_workspace as (
      insert into workspaces (id, name, personal_owner_user_id, created_by)
      values (${workspaceId}, ${workspaceName}, ${user.id}, ${user.id})
      on conflict (personal_owner_user_id)
      do update set updated_at = workspaces.updated_at
      returning id, name
    ), inserted_member as (
      insert into workspace_members (workspace_id, user_id, role)
      select id, ${user.id}, 'owner'::workspace_role
      from selected_workspace
      on conflict (workspace_id, user_id)
      do update set role = workspace_members.role
      returning workspace_id, role
    )
    select selected_workspace.id, selected_workspace.name, inserted_member.role
    from selected_workspace
    inner join inserted_member on inserted_member.workspace_id = selected_workspace.id
  `;

  const row = created[0] as { id: string; name: string; role: WorkspaceSummary["role"] } | undefined;
  if (!row) throw new Error("Unable to create or load the personal workspace.");
  return row;
};

export const requireWorkspaceAccess = async (
  userId: string,
  workspaceId: string,
  write = false,
) => {
  const membership = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  const role = membership[0]?.role;
  if (!role) throw new Response("Workspace not found.", { status: 404 });
  if (write && role === "viewer") {
    throw new Response("This workspace is read-only for the current user.", { status: 403 });
  }
  return role;
};
