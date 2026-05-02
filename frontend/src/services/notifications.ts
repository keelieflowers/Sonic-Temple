import * as Notifications from "expo-notifications";
import { BreakpointRow } from "./db";
import { ScheduleEntry } from "@/src/data/schedule";

const TRAVEL_MIN = 8;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function festivalDateTime(date: string, totalMinutes: number): Date {
  const d = new Date(date);
  d.setHours(Math.floor(totalMinutes / 60), Math.floor(totalMinutes % 60), 0, 0);
  return d;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleTestNotification(): Promise<void> {
  await requestNotificationPermissions();
  await Notifications.scheduleNotificationAsync({
    identifier: "test-departure",
    content: {
      title: "Time to go 🚩",
      body: "Leave Main Stage now — breakpoint for Metallica",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
    },
  });
  await Notifications.scheduleNotificationAsync({
    identifier: "test-arrival",
    content: {
      title: "Head to Audio Stage now 📍",
      body: '"Battery" by Metallica is coming up',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 8,
    },
  });
}

export async function scheduleBreakpointNotifications(
  entry: ScheduleEntry,
  bp: BreakpointRow,
  songs: string[]
): Promise<void> {
  await cancelBreakpointNotifications(entry.artist);

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const now = Date.now();
  const startMin = toMinutes(entry.startTime);
  const endMin = toMinutes(entry.endTime);
  const duration = endMin - startMin;

  // Departure reminder — fires at bp.departureTime
  if (bp.departureTime) {
    const fireDate = festivalDateTime(entry.date, toMinutes(bp.departureTime));
    if (fireDate.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `bp-depart-${entry.artist}`,
        content: {
          title: "Time to go 🚩",
          body: `Leave ${entry.stage} now — breakpoint for ${entry.artist}`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
        },
      });
    }
  }

  // Arrival reminder — fires TRAVEL_MIN before the arrival song
  if (bp.arrivalSongIndex != null && songs.length > 0) {
    const song = songs[bp.arrivalSongIndex];
    if (song) {
      const songMin = startMin + (bp.arrivalSongIndex / songs.length) * duration;
      const fireDate = festivalDateTime(entry.date, songMin - TRAVEL_MIN);
      if (fireDate.getTime() > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `bp-arrive-${entry.artist}`,
          content: {
            title: `Head to ${entry.stage} now 📍`,
            body: `"${song}" by ${entry.artist} is coming up`,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireDate,
          },
        });
      }
    }
  }
}

export async function cancelBreakpointNotifications(artist: string): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(`bp-depart-${artist}`),
    Notifications.cancelScheduledNotificationAsync(`bp-arrive-${artist}`),
  ]);
}
