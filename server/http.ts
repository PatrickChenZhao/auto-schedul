export const json = (value: unknown, init: ResponseInit = {}) =>
  Response.json(value, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init.headers,
    },
  });

export const readJson = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Response("Content-Type must be application/json.", { status: 415 });
  }
  try {
    return await request.json();
  } catch {
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
