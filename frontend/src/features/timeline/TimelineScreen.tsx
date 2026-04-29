import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { getAllCachedSetlists } from "@/src/services/db";
import { syncArtistSetlists, SyncProgress } from "@/src/services/sync";
import { SCHEDULE, ScheduleEntry } from "@/src/data/schedule";
import { ArtistShowResult } from "@/src/shared/Types";

type DayOption = "Thursday" | "Friday" | "Saturday" | "Sunday";

const DAYS: DayOption[] = ["Thursday", "Friday", "Saturday", "Sunday"];

const DAY_LABELS: Record<DayOption, string> = {
  Thursday: "Thu · May 14",
  Friday: "Fri · May 15",
  Saturday: "Sat · May 16",
  Sunday: "Sun · May 17",
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  const hDisplay = h % 12 || 12;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${hDisplay}:${String(m).padStart(2, "0")} ${suffix}`;
}

function buildConflictMap(entries: ScheduleEntry[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)) {
        if (!map.has(a.artist)) map.set(a.artist, []);
        if (!map.has(b.artist)) map.set(b.artist, []);
        map.get(a.artist)!.push(b.artist);
        map.get(b.artist)!.push(a.artist);
      }
    }
  }
  return map;
}

function getDefaultDay(): DayOption {
  const today = new Date().toISOString().split("T")[0];
  const map: Record<string, DayOption> = {
    "2026-05-14": "Thursday",
    "2026-05-15": "Friday",
    "2026-05-16": "Saturday",
    "2026-05-17": "Sunday",
  };
  return map[today] ?? "Thursday";
}

type Props = { selectedBands: string[] };

export function TimelineScreen({ selectedBands }: Props) {
  const colors = useColors();
  const s = styles(colors);
  const queryClient = useQueryClient();
  const [activeDay, setActiveDay] = useState<DayOption>(getDefaultDay);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ total: selectedBands.length, completed: 0, failed: 0 });
    await syncArtistSetlists(selectedBands, (p) => setSyncProgress(p));
    await queryClient.invalidateQueries({ queryKey: ["all-cached-setlists"] });
    setSyncing(false);
    setSyncProgress(null);
  };

  const { data: cachedSetlists } = useQuery({
    queryKey: ["all-cached-setlists"],
    queryFn: getAllCachedSetlists,
  });

  const setlistMap = useMemo(() => {
    const map = new Map<string, ArtistShowResult>();
    for (const cached of cachedSetlists ?? []) {
      try {
        map.set(cached.artistName, JSON.parse(cached.data) as ArtistShowResult);
      } catch {
        // skip malformed cache entries
      }
    }
    return map;
  }, [cachedSetlists]);

  const dayEntries = useMemo(
    () =>
      SCHEDULE.filter(
        (e) => e.day === activeDay && selectedBands.includes(e.artist)
      ).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [activeDay, selectedBands]
  );

  const conflictMap = useMemo(() => buildConflictMap(dayEntries), [dayEntries]);

  if (selectedBands.length === 0) {
    return (
      <SafeAreaView style={s.centered} edges={["top"]}>
        <Text style={s.empty}>Select artists in the Artists tab to see your timeline.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.dayPicker}
        contentContainerStyle={s.dayPickerContent}
      >
        {DAYS.map((day) => {
          const count = SCHEDULE.filter(
            (e) => e.day === day && selectedBands.includes(e.artist)
          ).length;
          const active = activeDay === day;
          return (
            <TouchableOpacity
              key={day}
              style={[s.dayPill, active && s.dayPillActive]}
              onPress={() => setActiveDay(day)}
            >
              <Text style={[s.dayPillText, active && s.dayPillTextActive]}>
                {DAY_LABELS[day]}
                {count > 0 ? ` (${count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.syncBar}>
        {syncing && syncProgress ? (
          <View style={s.syncProgress}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.syncText}>
              Syncing {syncProgress.completed}/{syncProgress.total}...
            </Text>
          </View>
        ) : (
          <TouchableOpacity style={s.syncButton} onPress={handleSync} disabled={syncing}>
            <Text style={s.syncButtonText}>Sync for Offline</Text>
          </TouchableOpacity>
        )}
      </View>

      {dayEntries.length === 0 ? (
        <View style={s.centeredFlex}>
          <Text style={s.empty}>No artists selected for {activeDay}.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: spacing.md }}
          data={dayEntries}
          keyExtractor={(item) => item.artist}
          renderItem={({ item }) => (
            <SetCard
              entry={item}
              conflictsWith={conflictMap.get(item.artist) ?? []}
              setlistResult={setlistMap.get(item.artist) ?? null}
              colors={colors}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

type SetCardProps = {
  entry: ScheduleEntry;
  conflictsWith: string[];
  setlistResult: ArtistShowResult | null;
  colors: ReturnType<typeof useColors>;
};

function SetCard({ entry, conflictsWith, setlistResult, colors }: SetCardProps) {
  const s = styles(colors);
  const startMin = toMinutes(entry.startTime);
  const endMin = toMinutes(entry.endTime);
  const duration = endMin - startMin;
  const hasConflict = conflictsWith.length > 0;

  const songs = setlistResult?.latestSetlist?.sections.flatMap((sec) => sec.songs) ?? [];

  return (
    <View style={[s.card, hasConflict && s.cardConflict]}>
      <View style={s.cardHeader}>
        <Text style={s.artistName} numberOfLines={1}>{entry.artist}</Text>
        {hasConflict && (
          <View style={s.conflictBadge}>
            <Text style={s.conflictBadgeText}>CONFLICT</Text>
          </View>
        )}
      </View>

      <Text style={s.stageLine}>
        {entry.stage} · {formatTime(startMin)} – {formatTime(endMin)}
      </Text>

      {hasConflict && (
        <Text style={s.conflictWith} numberOfLines={2}>
          Overlaps with: {conflictsWith.join(", ")}
        </Text>
      )}

      {songs.length > 0 ? (
        <View style={s.songList}>
          {songs.map((song, i) => {
            const songMin = startMin + (i / songs.length) * duration;
            return (
              <View key={i} style={s.songRow}>
                <Text style={s.songTime}>{formatTime(songMin)}</Text>
                <Text style={s.songName} numberOfLines={1}>{song}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={s.noSetlist}>
          {setlistResult === null
            ? "Sync setlists for a song-by-song view"
            : setlistResult.status === "no_setlist_found"
            ? "No setlist on record for this artist"
            : "No songs found in latest setlist"}
        </Text>
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    centeredFlex: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    empty: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      textAlign: "center",
    },
    dayPicker: {
      flexGrow: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    dayPickerContent: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    dayPill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.card,
      minHeight: 44,
      justifyContent: "center",
    },
    dayPillActive: {
      backgroundColor: colors.primary,
    },
    dayPillText: {
      color: colors.textSecondary,
      fontSize: fontSizes.sm,
      fontWeight: "600",
    },
    dayPillTextActive: {
      color: colors.card,
    },
    syncBar: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      alignItems: "flex-end",
    },
    syncButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
      justifyContent: "center",
    },
    syncButtonText: {
      color: colors.card,
      fontWeight: "700",
      fontSize: fontSizes.sm,
    },
    syncProgress: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 44,
    },
    syncText: {
      color: colors.textSecondary,
      fontSize: fontSizes.sm,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    cardConflict: {
      borderLeftWidth: 3,
      borderLeftColor: colors.error,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    artistName: {
      flex: 1,
      color: colors.text,
      fontSize: fontSizes.lg,
      fontWeight: "700",
    },
    conflictBadge: {
      backgroundColor: colors.error,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    conflictBadgeText: {
      color: "#FFFFFF",
      fontSize: fontSizes.xs,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    stageLine: {
      color: colors.textSecondary,
      fontSize: fontSizes.sm,
      marginBottom: spacing.xs,
    },
    conflictWith: {
      color: colors.error,
      fontSize: fontSizes.xs,
      marginBottom: spacing.sm,
    },
    songList: {
      marginTop: spacing.sm,
      gap: 2,
    },
    songRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    songTime: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      width: 72,
    },
    songName: {
      flex: 1,
      color: colors.text,
      fontSize: fontSizes.xs,
    },
    noSetlist: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      marginTop: spacing.sm,
      fontStyle: "italic",
    },
  });
