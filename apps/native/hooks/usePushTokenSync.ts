import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@server/convex/_generated/api";
import { useConvexUser } from "./useConvexUser";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

const PUSH_TOKEN_KEY = "openchat_push_token";

/**
 * Syncs the device push token to the Convex user record once the user is
 * authenticated. Re-runs whenever the convexUserId changes (e.g. sign-in).
 *
 * The token is stored in the users table under `pushToken` so that the
 * Convex backend can send targeted notifications via Expo Push API.
 */
export function usePushTokenSync() {
  const { convexUserId } = useConvexUser();
  const savePushToken = useMutation(api.users.savePushToken);
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!convexUserId) {
      syncedRef.current = null;
      return;
    }
    if (syncedRef.current === convexUserId) return;

    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") return;

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;

        // Skip if unchanged from last saved token
        const stored = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
        if (stored === token) {
          syncedRef.current = convexUserId;
          return;
        }

        await savePushToken({ userId: convexUserId, token });
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
        syncedRef.current = convexUserId;
      } catch {
        // Push token unavailable on simulators — silently ignore
      }
    })();
  }, [convexUserId, savePushToken]);
}
