export const json = (value: unknown, init: ResponseInit = {}) =>
  Response.json(value, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init.headers,
    },
  });

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export const readJson = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Response("Content-Type must be application/json.", { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new Response("Request body is too large.", { status: 413 });
  }

  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_JSON_BODY_BYTES) {
      throw new Response("Request body is too large.", { status: 413 });
    }
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Request body is not valid JSON.", { status: 400 });
  }
};

export const toErrorResponse = (error: unknown) => {
  if (error instanceof Response) return error;
  console.error(error);
  const isPreview = process.env.VERCEL_ENV === "preview";
  const previewMessage =
    isPreview && error instanceof Error
      ? `${error.name}: ${error.message}`.replace(/\s+/g, " ").slice(0, 500)
      : "";
  return json(
    { error: previewMessage || "Internal server error." },
    { status: 500 },
  );
};
