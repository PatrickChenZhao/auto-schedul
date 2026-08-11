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
  return json({ error: "Internal server error." }, { status: 500 });
};
