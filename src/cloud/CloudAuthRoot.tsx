import App, { type CloudAuthState } from "../App";
import { authClient } from "./authClient";

export const CloudAuthRoot = () => {
  if (!authClient) return <App />;
  const client = authClient;

  const session = client.useSession();
  const auth: CloudAuthState = {
    configured: true,
    pending: session.isPending,
    user: session.data?.user
      ? {
          id: session.data.user.id,
          name: session.data.user.name,
          email: session.data.user.email,
        }
      : null,
    signIn: async () => {
      await client.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
    },
    signOut: async () => {
      await client.signOut();
    },
  };

  return <App cloudAuth={auth} />;
};
