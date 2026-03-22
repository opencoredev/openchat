import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Configure notification display behaviour, request permissions,
 * and return the Expo push token so it can be stored in Convex.
 */
export async function setupPushNotifications(): Promise<string | null> {
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

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    // Emulators and simulators do not support push tokens
    return null;
  }
}

export function addNotificationListener(
  onReceive: (n: Notifications.Notification) => void,
  onResponse: (r: Notifications.NotificationResponse) => void
) {
  const a = Notifications.addNotificationReceivedListener(onReceive);
  const b = Notifications.addNotificationResponseReceivedListener(onResponse);
  return () => { a.remove(); b.remove(); };
}
