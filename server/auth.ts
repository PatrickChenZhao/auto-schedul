import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  name?: string;
};

let cachedJwksUrl = "";
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const getJwks = () => {
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!jwksUrl) {
    throw new Error("NEON_AUTH_JWKS_URL is required by the server API.");
  }
  if (!cachedJwks || cachedJwksUrl !== jwksUrl) {
    cachedJwksUrl = jwksUrl;
    cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return cachedJwks;
};

export const authenticateRequest = async (request: Request): Promise<AuthenticatedUser> => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response("Authentication required.", { status: 401 });
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new Response("Authentication required.", { status: 401 });
  }

  try {
    const verificationOptions: Parameters<typeof jwtVerify>[2] = {};
    if (process.env.NEON_AUTH_ISSUER) {
      verificationOptions.issuer = process.env.NEON_AUTH_ISSUER;
    }
    if (process.env.NEON_AUTH_AUDIENCE) {
      verificationOptions.audience = process.env.NEON_AUTH_AUDIENCE;
    }
    const { payload } = await jwtVerify(token, getJwks(), verificationOptions);
    if (!payload.sub) {
      throw new Error("JWT does not contain a subject.");
    }
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Invalid or expired authentication token.", { status: 401 });
  }
};
