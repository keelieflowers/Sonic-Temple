import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { getAllCachedSetlists } from "@/src/services/db";
import { syncArtistSetlists, SyncProgress } from "@/src/services/sync";
import { SCHEDULE } from "@/src/data/schedule";
import { ArtistShowResult } from "@/src/shared/Types";
import { toMinutes } from "@/src/utils/time";
import { CLOCK_INTERVAL_MS } from "@/src/constants/timing";
import { DayOption, TimelineItem, TimelineSection } from "./timeline.types";
import {
  buildConflictMap,
  buildTimelineItems,
  getItemLiveStatus,
  groupItemsByHour,
  itemKey,
} from "./timeline.utils";
import { ConflictCard } from "./ConflictCard";
import { SetCard } from "./SetCard";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: DayOption[] = ["Thursday", "Friday", "Saturday", "Sunday"];

const DAY_DATES: Record<DayOption, string> = {
  Thursday: "May 14", Friday: "May 15", Saturday: "May 16", Sunday: "May 17",
};

const DAY_SHORT: Record<DayOption, string> = {
  Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

const FESTIVAL_DATES: Record<DayOption, string> = {
  Thursday: "2026-05-14", Friday: "2026-05-15", Saturday: "2026-05-16", Sunday: "2026-05-17",
};

// Set to a time like "19:30" to simulate live mode, null uses real clock
const DEV_NOW_OVERRIDE: string | null = null;

// ─── Utilities ────────────────────────────────────────────────────────────────

function getNowMinutes(): number {
  if (DEV_NOW_OVERRIDE) return toMinutes(DEV_NOW_OVERRIDE);
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function getDefaultDay(): DayOption {
  const today = new Date().toISOString().split("T")[0];
  const map: Record<string, DayOption> = {
    "2026-05-14": "Thursday", "2026-05-15": "Friday",
    "2026-05-16": "Saturday", "2026-05-17": "Sunday",
  };
  return map[today] ?? "Thursday";
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Props = { selectedBands: string[] };

export function TimelineScreen({ selectedBands }: Props) {
  const colors = useColors();
  const s = styles(colors);
  const queryClient = useQueryClient();
  const [activeDay, setActiveDay] = useState<DayOption>(getDefaultDay);
  const [viewMode, setViewMode] = useState<"timeline" | "conflicts">("timeline");
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number>(getNowMinutes);

  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getNowMinutes()), CLOCK_INTERVAL_MS);
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
        console.warn(`[setlistMap] Skipping malformed cache entry for "${cached.artistName}"`);
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

  const conflictMap = useMemo(
    () => viewMode === "conflicts" ? buildConflictMap(dayEntries) : new Map(),
    [dayEntries, viewMode]
  );
  const timelineItems = useMemo(
    () => viewMode === "conflicts"
      ? buildTimelineItems(dayEntries, conflictMap)
      : dayEntries.map((entry): TimelineItem => ({ type: "single", entry })),
    [dayEntries, conflictMap, viewMode]
  );

  const sections = useMemo((): TimelineSection[] => {
    if (!isLiveDay) return groupItemsByHour(timelineItems, "upcoming");

    const playing: TimelineItem[] = [];
    const upcoming: TimelineItem[] = [];
    const finished: TimelineItem[] = [];

    for (const item of timelineItems) {
      const status = getItemLiveStatus(item, nowMinutes);
      if (status === "finished") finished.push(item);
      else if (status === "playing") playing.push(item);
      else upcoming.push(item);
    }

    const result: TimelineSection[] = [];
    if (playing.length > 0) result.push({ title: "PLAYING NOW", sectionType: "playing", data: playing });
    result.push(...groupItemsByHour(upcoming, "upcoming"));
    if (finished.length > 0) result.push({ title: "FINISHED", sectionType: "finished", data: finished });
    return result;
  }, [timelineItems, nowMinutes, isLiveDay]);

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

      <View style={s.modeToggle}>
        <TouchableOpacity
          style={[s.modeTab, viewMode === "timeline" && s.modeTabActive]}
          onPress={() => setViewMode("timeline")}
        >
          <Text style={[s.modeTabText, viewMode === "timeline" && s.modeTabTextActive]}>Timeline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeTab, viewMode === "conflicts" && s.modeTabActive]}
          onPress={() => setViewMode("conflicts")}
        >
          <Text style={[s.modeTabText, viewMode === "conflicts" && s.modeTabTextActive]}>Conflict Comparison</Text>
        </TouchableOpacity>
      </View>

      {dayEntries.length === 0 ? (
        <View style={s.centeredFlex}>
          <Text style={s.empty}>No artists selected for {activeDay}.</Text>
        </View>
      ) : (
        <SectionList
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          sections={sections}
          keyExtractor={itemKey}
          renderSectionHeader={({ section }) => {
            if (section.sectionType === "playing") {
              return (
                <View style={s.sectionHeaderPlaying}>
                  <View style={s.liveDot} />
                  <Text style={s.sectionHeaderPlayingText}>{section.title}</Text>
                </View>
              );
            }
            return (
              <View style={s.hourHeader}>
                <Text style={[
                  s.hourHeaderText,
                  section.sectionType === "finished" && s.hourHeaderTextDim,
                ]}>
                  {section.title}
                </Text>
                <View style={s.hourHeaderLine} />
              </View>
            );
          }}
          renderItem={({ item, section }) => {
            const isFinished = section.sectionType === "finished";
            if (item.type === "conflict") {
              return (
                <ConflictCard
                  item={item}
                  setlistMap={setlistMap}
                  nowMinutes={nowMinutes}
                  isLiveDay={isLiveDay}
                  isFinished={isFinished}
                />
              );
            }
            return (
              <SetCard
                entry={item.entry}
                setlistResult={setlistMap.get(item.entry.artist) ?? null}
                nowMinutes={nowMinutes}
                isLiveDay={isLiveDay}
                isFinished={isFinished}
              />
            );
          }}
          stickySectionHeadersEnabled={false}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={handleSync} disabled={syncing}>
        {syncing && syncProgress ? (
          <>
            <ActivityIndicator size="small" color={colors.card} />
            <Text style={s.fabProgressText}>{syncProgress.completed}/{syncProgress.total}</Text>
          </>
        ) : (
          <FontAwesome name="cloud-download" size={22} color={colors.card} />
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: {
      flex: 1, backgroundColor: colors.background,
      justifyContent: "center", alignItems: "center", padding: spacing.lg,
    },
    centeredFlex: {
      flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg,
    },
    empty: { color: colors.textMuted, fontSize: fontSizes.sm, textAlign: "center" },

    // Mode toggle
    modeToggle: {
      flexDirection: "row",
      margin: spacing.md,
      marginBottom: 0,
      backgroundColor: colors.cardSecondary,
      borderRadius: radii.md,
      padding: 3,
    },
    modeTab: {
      flex: 1,
      paddingVertical: spacing.xs,
      alignItems: "center" as const,
      borderRadius: radii.sm,
    },
    modeTabActive: {
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    modeTabText: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: "600" },
    modeTabTextActive: { color: colors.text },

    // Day picker
    dayPicker: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.divider },
    dayTab: {
      flex: 1, alignItems: "center", paddingVertical: spacing.sm,
      borderBottomWidth: 3, borderBottomColor: "transparent", minHeight: 52, justifyContent: "center",
    },
    dayTabActive: { borderBottomColor: colors.primary },
    dayDate: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: "500" },
    dayName: { color: colors.textSecondary, fontSize: fontSizes.sm, fontWeight: "700" },
    dayTextActive: { color: colors.primary },

    // FAB
    fab: {
      position: "absolute", bottom: spacing.xl, right: spacing.md,
      width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center", gap: 2,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
    },
    fabProgressText: { color: colors.card, fontSize: fontSizes.xs, fontWeight: "700" },

    // Section headers
    sectionHeaderPlaying: {
      flexDirection: "row", alignItems: "center", gap: spacing.sm,
      marginBottom: spacing.sm, marginTop: spacing.xs,
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
    sectionHeaderPlayingText: {
      color: colors.success, fontSize: fontSizes.xs, fontWeight: "700", letterSpacing: 1,
    },
    hourHeader: {
      flexDirection: "row", alignItems: "center", gap: spacing.sm,
      marginBottom: spacing.sm, marginTop: spacing.xs,
    },
    hourHeaderText: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: "600", letterSpacing: 0.5 },
    hourHeaderTextDim: { opacity: 0.5 },
    hourHeaderLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  });
