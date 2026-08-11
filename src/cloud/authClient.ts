import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim() ?? "";
export const cloudIsConfigured = Boolean(neonAuthUrl);

export const authClient = cloudIsConfigured
  ? createAuthClient(neonAuthUrl, { adapter: BetterAuthReactAdapter() })
  : null;

export const getAuthToken = async () => {
  if (!authClient) throw new Error("Neon Auth is not configured.");
  const session = await authClient.getSession();
  const token = session.data?.session?.token;
  if (!token) {
    throw new Error("Unable to obtain a Neon Auth JWT. Please sign out and sign in again.");
  }
  return token;
};
