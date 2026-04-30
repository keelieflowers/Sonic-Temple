import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SectionList,
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
type SectionType = "playing" | "upcoming" | "finished";
type TimelineSection = { title: string; sectionType: SectionType; data: ScheduleEntry[] };

const DAYS: DayOption[] = ["Thursday", "Friday", "Saturday", "Sunday"];

const DAY_DATES: Record<DayOption, string> = {
  Thursday: "May 14",
  Friday: "May 15",
  Saturday: "May 16",
  Sunday: "May 17",
};

const DAY_SHORT: Record<DayOption, string> = {
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const FESTIVAL_DATES: Record<DayOption, string> = {
  Thursday: "2026-05-14",
  Friday: "2026-05-15",
  Saturday: "2026-05-16",
  Sunday: "2026-05-17",
};

// Set to a time like "19:30" to simulate live mode, null uses real clock
const DEV_NOW_OVERRIDE: string | null = null;

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

function getNowMinutes(): number {
  if (DEV_NOW_OVERRIDE) return toMinutes(DEV_NOW_OVERRIDE);
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
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

function groupByHour(entries: ScheduleEntry[], sectionType: SectionType): TimelineSection[] {
  const hourMap = new Map<number, ScheduleEntry[]>();
  for (const entry of entries) {
    const hour = Math.floor(toMinutes(entry.startTime) / 60);
    if (!hourMap.has(hour)) hourMap.set(hour, []);
    hourMap.get(hour)!.push(entry);
  }
  return [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, data]) => ({ title: formatTime(hour * 60), sectionType, data }));
}

type Props = { selectedBands: string[] };

export function TimelineScreen({ selectedBands }: Props) {
  const colors = useColors();
  const s = styles(colors);
  const queryClient = useQueryClient();
  const [activeDay, setActiveDay] = useState<DayOption>(getDefaultDay);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number>(getNowMinutes);

  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getNowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isLiveDay = useMemo(
    () => DEV_NOW_OVERRIDE !== null || FESTIVAL_DATES[activeDay] === new Date().toISOString().split("T")[0],
    [activeDay]
  );

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
        // skip malformed entries
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

  const sections = useMemo((): TimelineSection[] => {
    if (!isLiveDay) return groupByHour(dayEntries, "upcoming");

    const playing: ScheduleEntry[] = [];
    const upcoming: ScheduleEntry[] = [];
    const finished: ScheduleEntry[] = [];

    for (const entry of dayEntries) {
      const start = toMinutes(entry.startTime);
      const end = toMinutes(entry.endTime);
      if (nowMinutes >= end) finished.push(entry);
      else if (nowMinutes >= start) playing.push(entry);
      else upcoming.push(entry);
    }

    const result: TimelineSection[] = [];
    if (playing.length > 0) result.push({ title: "PLAYING NOW", sectionType: "playing", data: playing });
    result.push(...groupByHour(upcoming, "upcoming"));
    if (finished.length > 0) result.push({ title: "FINISHED", sectionType: "finished", data: finished });
    return result;
  }, [dayEntries, nowMinutes, isLiveDay]);

  if (selectedBands.length === 0) {
    return (
      <SafeAreaView style={s.centered} edges={["top"]}>
        <Text style={s.empty}>Select artists in the Artists tab to see your timeline.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.dayPicker}>
        {DAYS.map((day) => {
          const active = activeDay === day;
          return (
            <TouchableOpacity
              key={day}
              style={[s.dayTab, active && s.dayTabActive]}
              onPress={() => setActiveDay(day)}
            >
              <Text style={[s.dayDate, active && s.dayTextActive]}>{DAY_DATES[day]}</Text>
              <Text style={[s.dayName, active && s.dayTextActive]}>{DAY_SHORT[day]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {dayEntries.length === 0 ? (
        <View style={s.centeredFlex}>
          <Text style={s.empty}>No artists selected for {activeDay}.</Text>
        </View>
      ) : (
        <SectionList
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          sections={sections}
          keyExtractor={(item) => item.artist}
          renderSectionHeader={({ section }) => {
            if (section.sectionType === "playing") {
              return (
                <View style={s.sectionHeaderPlaying}>
                  <View style={s.liveDot} />
                  <Text style={s.sectionHeaderPlayingText}>{section.title}</Text>
                </View>
              );
            }
            if (section.sectionType === "finished") {
              return (
                <View style={s.hourHeader}>
                  <Text style={s.sectionHeaderFinishedText}>{section.title}</Text>
                  <View style={s.hourHeaderLine} />
                </View>
              );
            }
            return (
              <View style={s.hourHeader}>
                <Text style={s.hourHeaderText}>{section.title}</Text>
                <View style={s.hourHeaderLine} />
              </View>
            );
          }}
          renderItem={({ item, section }) => (
            <SetCard
              entry={item}
              conflictsWith={conflictMap.get(item.artist) ?? []}
              setlistResult={setlistMap.get(item.artist) ?? null}
              nowMinutes={nowMinutes}
              isLiveDay={isLiveDay}
              isFinished={section.sectionType === "finished"}
              colors={colors}
            />
          )}
          stickySectionHeadersEnabled={false}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={handleSync} disabled={syncing}>
        {syncing && syncProgress ? (
          <>
            <ActivityIndicator size="small" color={colors.card} />
            <Text style={s.fabProgressText}>
              {syncProgress.completed}/{syncProgress.total}
            </Text>
          </>
        ) : (
          <FontAwesome name="cloud-download" size={22} color={colors.card} />
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

type SetCardProps = {
  entry: ScheduleEntry;
  conflictsWith: string[];
  setlistResult: ArtistShowResult | null;
  nowMinutes: number;
  isLiveDay: boolean;
  isFinished: boolean;
  colors: ReturnType<typeof useColors>;
};

function SetCard({ entry, conflictsWith, setlistResult, nowMinutes, isLiveDay, isFinished, colors }: SetCardProps) {
  const s = styles(colors);
  const startMin = toMinutes(entry.startTime);
  const endMin = toMinutes(entry.endTime);
  const duration = endMin - startMin;
  const hasConflict = conflictsWith.length > 0;

  const isPlaying = isLiveDay && nowMinutes >= startMin && nowMinutes < endMin;
  const minsRemaining = isPlaying ? endMin - nowMinutes : 0;

  const [expanded, setExpanded] = useState(isPlaying);

  const songs = setlistResult?.latestSetlist?.sections.flatMap((sec) => sec.songs) ?? [];

  return (
    <View style={[s.card, hasConflict && s.cardConflict, isFinished && s.cardFinished]}>
      <TouchableOpacity style={s.cardHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Text style={s.artistName} numberOfLines={1}>{entry.artist}</Text>
        {setlistResult?.selectionMode === "festivalVenuePriority" && (
          <FontAwesome name="star" size={12} color={colors.success} />
        )}
        {setlistResult?.selectionMode === "recencyFallback" && (
          <FontAwesome name="clock-o" size={12} color={colors.textMuted} />
        )}
        {isPlaying && (
          <View style={s.liveBadge}>
            <Text style={s.liveBadgeText}>LIVE</Text>
          </View>
        )}
        {hasConflict && (
          <View style={s.conflictBadge}>
            <Text style={s.conflictBadgeText}>CONFLICT</Text>
          </View>
        )}
        <FontAwesome
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      <Text style={s.stageLine}>
        <Text style={s.stageName}>{entry.stage}</Text>
        <Text style={s.stageTime}> · {formatTime(startMin)} – {formatTime(endMin)}</Text>
      </Text>

      {isPlaying && (
        <Text style={s.minsRemaining}>{minsRemaining} min remaining</Text>
      )}

      {expanded && (
        <>
          {hasConflict && (
            <Text style={s.conflictWith} numberOfLines={2}>
              Overlaps with: {conflictsWith.join(", ")}
            </Text>
          )}

          {songs.length > 0 ? (
            <View style={s.songList}>
              {songs.map((song, i) => {
                const songMin = startMin + (i / songs.length) * duration;
                const nextSongMin = i + 1 < songs.length
                  ? startMin + ((i + 1) / songs.length) * duration
                  : endMin;

                const status = !isPlaying ? "upcoming"
                  : nowMinutes >= nextSongMin ? "played"
                  : nowMinutes >= songMin ? "current"
                  : "upcoming";

                return (
                  <View
                    key={i}
                    style={[s.songRow, status === "played" && s.songRowDim]}
                  >
                    <Text style={[
                      s.songTime,
                      status === "current" && s.songTimeCurrent,
                      status === "played" && s.songTimeDim,
                    ]}>
                      {formatTime(songMin)}
                    </Text>
                    <Text
                      style={[
                        s.songName,
                        status === "current" && s.songNameCurrent,
                        status === "played" && s.songNameDim,
                      ]}
                      numberOfLines={1}
                    >
                      {status === "current" ? "▶  " : ""}{song}
                    </Text>
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
        </>
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
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    dayTab: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderBottomWidth: 3,
      borderBottomColor: "transparent",
      minHeight: 52,
      justifyContent: "center",
    },
    dayTabActive: {
      borderBottomColor: colors.primary,
    },
    dayDate: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontWeight: "500",
    },
    dayName: {
      color: colors.textSecondary,
      fontSize: fontSizes.sm,
      fontWeight: "700",
    },
    dayTextActive: {
      color: colors.primary,
    },
    fab: {
      position: "absolute",
      bottom: spacing.xl,
      right: spacing.md,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    fabProgressText: {
      color: colors.card,
      fontSize: fontSizes.xs,
      fontWeight: "700",
    },
    sectionHeaderPlaying: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    sectionHeaderPlayingText: {
      color: colors.success,
      fontSize: fontSizes.xs,
      fontWeight: "700",
      letterSpacing: 1,
    },
    hourHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    hourHeaderText: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontWeight: "600",
      letterSpacing: 0.5,
    },
    sectionHeaderFinishedText: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontWeight: "600",
      letterSpacing: 0.5,
      opacity: 0.6,
    },
    hourHeaderLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.divider,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    cardConflict: {
      borderLeftWidth: 3,
      borderLeftColor: colors.error,
    },
    cardFinished: {
      opacity: 0.45,
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
      fontSize: fontSizes.md,
      fontWeight: "700",
    },
    liveBadge: {
      backgroundColor: colors.success,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    liveBadgeText: {
      color: "#FFFFFF",
      fontSize: fontSizes.xs,
      fontWeight: "700",
      letterSpacing: 0.5,
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
      fontSize: fontSizes.sm,
      marginBottom: spacing.xs,
    },
    stageName: {
      color: colors.primary,
      fontWeight: "700",
    },
    stageTime: {
      color: colors.textMuted,
      fontWeight: "400",
    },
    minsRemaining: {
      color: colors.success,
      fontSize: fontSizes.xs,
      fontWeight: "600",
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
    songRowDim: {
      opacity: 0.35,
    },
    songTime: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      width: 72,
    },
    songTimeCurrent: {
      color: colors.success,
      fontWeight: "700",
    },
    songTimeDim: {
      color: colors.textMuted,
    },
    songName: {
      flex: 1,
      color: colors.text,
      fontSize: fontSizes.xs,
    },
    songNameCurrent: {
      color: colors.success,
      fontWeight: "700",
    },
    songNameDim: {
      color: colors.textMuted,
    },
    noSetlist: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      marginTop: spacing.sm,
      fontStyle: "italic",
    },
  });
