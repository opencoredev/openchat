import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Configure notification display behaviour and request permissions.
 * Should be called once at app startup (from _layout.tsx).
 *
 * On Android 13+ and iOS, a permission prompt will be shown on first call.
 * The returned token can be sent to the server so it can target this device
 * via Expo Push Notifications (future work).
 */
export async function setupPushNotifications(): Promise<string | null> {
  // Set how incoming notifications look while the app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "OpenChat",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return null;

  // Physical devices only — emulators do not receive push tokens
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

/**
 * Subscribe to incoming notification events.
 * Use this in any screen that needs to respond to tapped notifications.
 *
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 */
export function addNotificationListener(
  onReceive: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void
) {
  const receiveSub = Notifications.addNotificationReceivedListener(onReceive);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);
  return () => {
    receiveSub.remove();
    responseSub.remove();
  };
}
