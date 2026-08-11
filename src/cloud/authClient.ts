import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim() ?? "";
export const cloudIsConfigured = Boolean(neonAuthUrl);

export const authClient = cloudIsConfigured
  ? createAuthClient(neonAuthUrl, { adapter: BetterAuthReactAdapter() })
  : null;

export const getAuthToken = async () => {
  if (!authClient) throw new Error("Neon Auth is not configured.");
  const result = await authClient.token();
  if (result.error || !result.data?.token) {
    throw new Error(result.error?.message ?? "Unable to obtain an authentication token.");
  }
  return result.data.token;
};
