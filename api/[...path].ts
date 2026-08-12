import { z, ZodError } from "zod";
import { authenticateRequest } from "../server/auth.js";
import { json, readJson, toErrorResponse } from "../server/http.js";
import {
  createHistoryRequestSchema,
  saveConfigurationRequestSchema,
} from "../src/cloud/contracts.js";
import {
  loadConfiguration,
  saveConfiguration,
} from "../server/services/configuration.js";
import {
  createHistoryFromExcelExport,
  getHistoryDetail,
  listHistory,
} from "../server/services/history.js";
import {
  ensurePersonalWorkspace,
  requireWorkspaceAccess,
} from "../server/services/workspaces.js";

const matchWorkspaceRoute = (pathname: string, searchParams: URLSearchParams) => {
  if (pathname === "/api/cloud") {
    const action = searchParams.get("action");
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId || (action !== "configuration" && action !== "history")) return null;
    return {
      workspaceId,
      resource: action,
      resourceId: searchParams.get("historyId") ?? undefined,
    };
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "workspaces" || !parts[2]) return null;
  return {
    workspaceId: parts[2],
    resource: parts[3] ?? "",
    resourceId: parts[4],
  };
};

const handler = async (request: Request): Promise<Response> => {
  try {
    const user = await authenticateRequest(request);
    const { pathname, searchParams } = new URL(request.url);

    const cloudAction = pathname === "/api/cloud" ? searchParams.get("action") : null;
    if (
      request.method === "GET" &&
      (pathname === "/api/bootstrap" || cloudAction === "bootstrap")
    ) {
      const workspace = await ensurePersonalWorkspace(user);
      return json(await loadConfiguration(workspace));
    }

    const route = matchWorkspaceRoute(pathname, searchParams);
    if (!route) return json({ error: "API route not found." }, { status: 404 });
    route.workspaceId = z.string().uuid().parse(route.workspaceId);
    if (route.resourceId) route.resourceId = z.string().uuid().parse(route.resourceId);

    if (route.resource === "configuration" && !route.resourceId && request.method === "PUT") {
      await requireWorkspaceAccess(user.id, route.workspaceId, true);
      const payload = saveConfigurationRequestSchema.parse(await readJson(request));
      return json(
        await saveConfiguration({
          workspaceId: route.workspaceId,
          userId: user.id,
          ...payload,
        }),
      );
    }

    if (route.resource === "history" && !route.resourceId && request.method === "POST") {
      await requireWorkspaceAccess(user.id, route.workspaceId, true);
      const payload = createHistoryRequestSchema.parse(await readJson(request));
      const result = await createHistoryFromExcelExport({
        workspaceId: route.workspaceId,
        userId: user.id,
        idempotencyKey: payload.idempotencyKey,
        weekStart: payload.weekStart,
        format: payload.format,
        schedule: payload.schedule,
        settings: payload.settingsSnapshot,
      });
      return json(result, { status: result.created ? 201 : 200 });
    }

    if (route.resource === "history" && !route.resourceId && request.method === "GET") {
      await requireWorkspaceAccess(user.id, route.workspaceId);
      const requestedLimit = Number(searchParams.get("limit") ?? "50");
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
      return json({ items: await listHistory(route.workspaceId, limit) });
    }

    if (route.resource === "history" && route.resourceId && request.method === "GET") {
      await requireWorkspaceAccess(user.id, route.workspaceId);
      return json(await getHistoryDetail(route.workspaceId, route.resourceId));
    }

    return json({ error: "API route not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        { error: "Validation failed.", issues: error.issues },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
};

export default { fetch: handler };
