import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  LayoutAnimation,
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
import { useBreakpoints } from "@/src/providers/breakpoints/BreakpointProvider";
import { useLineup } from "@/src/providers/lineup/LineupProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { getAllCachedSetlists } from "@/src/services/db";
import { syncArtistSetlists, SyncProgress } from "@/src/services/sync";
import { SCHEDULE, ScheduleEntry } from "@/src/data/schedule";
import { ArtistShowResult } from "@/src/shared/Types";
import { BreakpointSheet } from "./BreakpointSheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type DayOption = "Thursday" | "Friday" | "Saturday" | "Sunday";
type SectionType = "playing" | "upcoming" | "finished";
type SingleItem = { type: "single"; entry: ScheduleEntry };
type ConflictItem = { type: "conflict"; entries: ScheduleEntry[] };
type TimelineItem = SingleItem | ConflictItem;
type TimelineSection = { title: string; sectionType: SectionType; data: TimelineItem[] };

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

// Pixels per minute for conflict column offset
const PX_PER_MIN = 2.5;

// Estimated walk time between stages in minutes
const TRAVEL_MIN = 8;

// ─── Utilities ────────────────────────────────────────────────────────────────

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  const hDisplay = h % 12 || 12;
  return `${hDisplay}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function formatTimeShort(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

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

// ─── Conflict logic ───────────────────────────────────────────────────────────

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

function buildTimelineItems(entries: ScheduleEntry[], conflictMap: Map<string, string[]>): TimelineItem[] {
  const artistMap = new Map(entries.map((e) => [e.artist, e]));
  const visited = new Set<string>();
  const items: TimelineItem[] = [];

  for (const entry of entries) {
    if (visited.has(entry.artist)) continue;

    const hasConflicts = (conflictMap.get(entry.artist)?.length ?? 0) > 0;
    if (!hasConflicts) {
      visited.add(entry.artist);
      items.push({ type: "single", entry });
      continue;
    }

    // BFS to find the full connected conflict cluster
    const cluster: ScheduleEntry[] = [];
    const queue = [entry.artist];
    while (queue.length > 0) {
      const artist = queue.shift()!;
      if (visited.has(artist)) continue;
      visited.add(artist);
      const e = artistMap.get(artist);
      if (e) cluster.push(e);
      for (const neighbor of conflictMap.get(artist) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    cluster.sort((a, b) => a.startTime.localeCompare(b.startTime));
    items.push({ type: "conflict", entries: cluster });
  }

  return items;
}

function getItemStartTime(item: TimelineItem): string {
  return item.type === "single" ? item.entry.startTime : item.entries[0].startTime;
}

function getItemLiveStatus(item: TimelineItem, now: number): "playing" | "finished" | "upcoming" {
  const starts = item.type === "single"
    ? [toMinutes(item.entry.startTime)]
    : item.entries.map((e) => toMinutes(e.startTime));
  const ends = item.type === "single"
    ? [toMinutes(item.entry.endTime)]
    : item.entries.map((e) => toMinutes(e.endTime));
  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  if (now >= latest) return "finished";
  if (now >= earliest) return "playing";
  return "upcoming";
}

function groupItemsByHour(items: TimelineItem[], sectionType: SectionType): TimelineSection[] {
  const hourMap = new Map<number, TimelineItem[]>();
  for (const item of items) {
    const hour = Math.floor(toMinutes(getItemStartTime(item)) / 60);
    if (!hourMap.has(hour)) hourMap.set(hour, []);
    hourMap.get(hour)!.push(item);
  }
  return [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, data]) => ({ title: formatTime(hour * 60), sectionType, data }));
}

function itemKey(item: TimelineItem): string {
  return item.type === "single"
    ? item.entry.artist
    : item.entries.map((e) => e.artist).sort().join("|");
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
                  colors={colors}
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
                colors={colors}
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

// ─── Conflict Card ────────────────────────────────────────────────────────────

type ConflictCardProps = {
  item: ConflictItem;
  setlistMap: Map<string, ArtistShowResult>;
  nowMinutes: number;
  isLiveDay: boolean;
  isFinished: boolean;
  colors: ReturnType<typeof useColors>;
};

function ConflictCard({ item, setlistMap, nowMinutes, isLiveDay, isFinished, colors }: ConflictCardProps) {
  const s = styles(colors);
  const { getBreakpoint, setBreakpoint, removeBreakpoint } = useBreakpoints();
  const { toggleBand } = useLineup();
  const { entries } = item;
  const earliestStart = Math.min(...entries.map((e) => toMinutes(e.startTime)));
  const latestEnd = Math.max(...entries.map((e) => toMinutes(e.endTime)));
  const [focusedArtist, setFocusedArtist] = useState<string | null>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const [sheetTarget, setSheetTarget] = useState<ScheduleEntry | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const focusedEntry = focusedArtist != null
    ? (entries.find((e) => e.artist === focusedArtist) ?? null)
    : null;

  // For each entry, compute arrival time based on another entry's departure breakpoint
  const arrivalMap = new Map<string, number>();
  for (const entry of entries) {
    const bp = getBreakpoint(entry.artist);
    if (bp?.departureTime) {
      const [h, m] = bp.departureTime.split(":").map(Number);
      const arrival = h * 60 + m + TRAVEL_MIN;
      for (const other of entries) {
        if (other.artist !== entry.artist) {
          const existing = arrivalMap.get(other.artist);
          if (existing == null || arrival < existing) arrivalMap.set(other.artist, arrival);
        }
      }
    }
  }

  // Inverse: if an entry has an arrival song marker, compute "leave by" for all other entries
  const leaveByMap = new Map<string, { min: number; songName: string }>();
  for (const entry of entries) {
    const bp = getBreakpoint(entry.artist);
    if (bp?.arrivalSongIndex != null) {
      const songs = setlistMap.get(entry.artist)?.latestSetlist?.sections.flatMap((s) => s.songs) ?? [];
      const song = songs[bp.arrivalSongIndex];
      if (song) {
        const eStart = toMinutes(entry.startTime);
        const eDuration = toMinutes(entry.endTime) - eStart;
        const songMin = eStart + (bp.arrivalSongIndex / songs.length) * eDuration;
        const leaveBy = songMin - TRAVEL_MIN;
        for (const other of entries) {
          if (other.artist !== entry.artist) {
            const existing = leaveByMap.get(other.artist);
            if (existing == null || leaveBy < existing.min) {
              leaveByMap.set(other.artist, { min: leaveBy, songName: song });
            }
          }
        }
      }
    }
  }

  const animateTransition = (next: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      next();
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  const handleFocus = (artist: string) => animateTransition(() => setFocusedArtist(artist));
  const handleCollapse = () => animateTransition(() => setFocusedArtist(null));

  return (
    <View style={[s.conflictCard, isFinished && s.cardFinished]}>
      <TouchableOpacity
        style={s.conflictCardHeader}
        onPress={focusedEntry != null ? handleCollapse : undefined}
        activeOpacity={focusedEntry != null ? 0.7 : 1}
      >
        <FontAwesome
          name={focusedEntry != null ? "chevron-left" : "exclamation-circle"}
          size={12}
          color={focusedEntry != null ? colors.textMuted : colors.error}
        />
        <Text style={s.conflictCardTitle}>CONFLICT</Text>
        <Text style={s.conflictCardTime}>
          {formatTime(earliestStart)} – {formatTime(latestEnd)}
        </Text>
      </TouchableOpacity>

      {focusedEntry != null ? (
        <TouchableOpacity
          style={[
            s.conflictColumnExpanded,
            lockedHeight != null && { height: lockedHeight },
          ]}
          onPress={handleCollapse}
          onLongPress={() => setSheetTarget(focusedEntry)}
          activeOpacity={0.95}
          delayLongPress={400}
        >
          <Animated.View style={{ opacity: fadeAnim, width: "100%" }}>
            <ConflictColumn
              entry={focusedEntry}
              setlistResult={setlistMap.get(focusedEntry.artist) ?? null}
              nowMinutes={nowMinutes}
              isLiveDay={isLiveDay}
              offsetPx={0}
              breakpoint={getBreakpoint(focusedEntry.artist) ?? null}
              arrivalMin={arrivalMap.get(focusedEntry.artist) ?? null}
              leaveBy={leaveByMap.get(focusedEntry.artist) ?? null}
              colors={colors}
              expanded
            />
          </Animated.View>
        </TouchableOpacity>
      ) : (
        <Animated.View
          style={[s.conflictColumns, { opacity: fadeAnim }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setLockedHeight((prev) => Math.max(prev ?? 0, h));
          }}
        >
          {entries.map((entry, i) => {
            const offsetPx = (toMinutes(entry.startTime) - earliestStart) * PX_PER_MIN;
            return (
              <React.Fragment key={entry.artist}>
                {i > 0 && <View style={s.columnDivider} />}
                <TouchableOpacity
                  style={s.conflictColumnTouchable}
                  onPress={() => handleFocus(entry.artist)}
                  onLongPress={() => setSheetTarget(entry)}
                  activeOpacity={0.7}
                  delayLongPress={400}
                >
                  <ConflictColumn
                    entry={entry}
                    setlistResult={setlistMap.get(entry.artist) ?? null}
                    nowMinutes={nowMinutes}
                    isLiveDay={isLiveDay}
                    offsetPx={offsetPx}
                    breakpoint={getBreakpoint(entry.artist) ?? null}
                    arrivalMin={arrivalMap.get(entry.artist) ?? null}
                    leaveBy={leaveByMap.get(entry.artist) ?? null}
                    colors={colors}
                  />
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </Animated.View>
      )}

      {sheetTarget && (
        <BreakpointSheet
          entry={sheetTarget}
          setlistResult={setlistMap.get(sheetTarget.artist) ?? null}
          existing={getBreakpoint(sheetTarget.artist) ?? null}
          onSave={setBreakpoint}
          onDelete={() => removeBreakpoint(sheetTarget!.artist)}
          onDropArtist={() => toggleBand(sheetTarget!.artist)}
          onClose={() => setSheetTarget(null)}
        />
      )}
    </View>
  );
}

type ConflictColumnProps = {
  entry: ScheduleEntry;
  setlistResult: ArtistShowResult | null;
  nowMinutes: number;
  isLiveDay: boolean;
  offsetPx: number;
  breakpoint: import("@/src/services/db").BreakpointRow | null;
  arrivalMin: number | null;
  leaveBy: { min: number; songName: string } | null;
  colors: ReturnType<typeof useColors>;
  expanded?: boolean;
};

function ConflictColumn({ entry, setlistResult, nowMinutes, isLiveDay, offsetPx, breakpoint, arrivalMin, leaveBy, colors, expanded }: ConflictColumnProps) {
  const s = styles(colors);
  const startMin = toMinutes(entry.startTime);
  const endMin = toMinutes(entry.endTime);
  const duration = endMin - startMin;
  const isPlaying = isLiveDay && nowMinutes >= startMin && nowMinutes < endMin;
  const songs = setlistResult?.latestSetlist?.sections.flatMap((sec) => sec.songs) ?? [];

  const departureMin = (() => {
    if (!breakpoint) return null;
    if (breakpoint.departureTime) {
      const [h, m] = breakpoint.departureTime.split(":").map(Number);
      return h * 60 + m;
    }
    return null;
  })();

  const breakpointLabel = (() => {
    if (!breakpoint) return null;
    if (breakpoint.type === "song" && breakpoint.songIndex != null && songs[breakpoint.songIndex]) {
      return `🚩 After "${songs[breakpoint.songIndex]}"`;
    }
    if (departureMin != null) return `🚩 Leaving ${formatTime(departureMin)}`;
    return null;
  })();

  const arrivalLabel = (() => {
    if (!breakpoint || breakpoint.arrivalSongIndex == null) return null;
    const song = songs[breakpoint.arrivalSongIndex];
    if (!song) return null;
    const arrMin = startMin + (breakpoint.arrivalSongIndex / songs.length) * duration;
    return `📍 Must see "${song}" · ${formatTime(arrMin)}`;
  })();

  return (
    <View style={[s.conflictColumn, !expanded && { marginTop: offsetPx }]}>
      <Text style={[s.columnArtist, expanded && s.columnTextCentered]} numberOfLines={2}>{entry.artist}</Text>
      <Text style={[s.columnStage, expanded && s.columnTextCentered]} numberOfLines={1}>{entry.stage}</Text>
      <Text style={[s.columnTime, expanded && s.columnTextCentered]}>{formatTime(startMin)} – {formatTime(endMin)}</Text>

      {breakpointLabel && (
        <Text style={[s.columnBreakpoint, expanded && s.columnTextCentered]}>{breakpointLabel}</Text>
      )}
      {arrivalLabel && (
        <Text style={[s.columnArrivalMustSee, expanded && s.columnTextCentered]}>{arrivalLabel}</Text>
      )}
      {arrivalMin != null && (
        <Text style={[s.columnArrival, expanded && s.columnTextCentered]}>
          ↳ Arriving ~{formatTime(arrivalMin)}
        </Text>
      )}
      {leaveBy != null && (
        <Text style={[s.columnLeaveBy, expanded && s.columnTextCentered]}>
          ↳ Leave by {formatTime(leaveBy.min)} for "{leaveBy.songName}"
        </Text>
      )}

      {isPlaying && (
        <Text style={[s.columnMinsLeft, expanded && s.columnTextCentered]}>{endMin - nowMinutes} min left</Text>
      )}

      {songs.length > 0 ? (
        <View style={s.columnSongs}>
          {songs.map((song, i) => {
            const songMin = startMin + (i / songs.length) * duration;
            const nextSongMin = i + 1 < songs.length
              ? startMin + ((i + 1) / songs.length) * duration
              : endMin;
            const status = !isPlaying ? "upcoming"
              : nowMinutes >= nextSongMin ? "played"
              : nowMinutes >= songMin ? "current"
              : "upcoming";
            const isBreakpointSong = breakpoint?.type === "song" && breakpoint.songIndex === i;
            const afterBreakpoint = breakpoint?.type === "song" && breakpoint.songIndex != null && i > breakpoint.songIndex;
            const afterDepartureTime = departureMin != null && songMin >= departureMin;
            const isDeparted = afterBreakpoint || afterDepartureTime;

            const isArrivalSong = breakpoint?.arrivalSongIndex === i;
            const beforeArrival = breakpoint?.arrivalSongIndex != null && i < breakpoint.arrivalSongIndex;
            const afterLeaveBy = leaveBy != null && songMin >= leaveBy.min;

            const prevSongMin = i > 0 ? startMin + ((i - 1) / songs.length) * duration : startMin;
            const isFirstAfterArrival = arrivalMin != null && prevSongMin < arrivalMin && songMin >= arrivalMin;
            const missedByArrival = arrivalMin != null && nextSongMin <= arrivalMin;

            return (
              <React.Fragment key={i}>
                {isFirstAfterArrival && (
                  <View style={s.arrivalDivider}>
                    <View style={s.arrivalDividerLine} />
                    <Text style={s.arrivalDividerText}>you arrive</Text>
                    <View style={s.arrivalDividerLine} />
                  </View>
                )}
                {leaveBy != null && i > 0 && prevSongMin < leaveBy.min && songMin >= leaveBy.min && (
                  <View style={s.leaveByDivider}>
                    <View style={s.leaveByDividerLine} />
                    <Text style={s.leaveByDividerText}>leave now</Text>
                    <View style={s.leaveByDividerLine} />
                  </View>
                )}
                <Text
                  style={[
                    s.columnSong,
                    status === "current" && s.columnSongCurrent,
                    status === "played" && s.columnSongPlayed,
                    isDeparted && s.columnSongAfterBreakpoint,
                    missedByArrival && s.columnSongMissed,
                    beforeArrival && s.columnSongBeforeArrival,
                    isArrivalSong && s.columnSongArrival,
                    afterLeaveBy && s.columnSongAfterLeaveBy,
                  ]}
                  numberOfLines={1}
                >
                  {formatTimeShort(songMin)}  {status === "current" ? "▶ " : ""}{song}{isBreakpointSong ? "  🚩" : ""}{isArrivalSong ? "  📍" : ""}
                </Text>
              </React.Fragment>
            );
          })}
        </View>
      ) : (
        <Text style={[s.columnNoSetlist, expanded && s.columnTextCentered]}>No setlist synced</Text>
      )}
    </View>
  );
}

// ─── Set Card ─────────────────────────────────────────────────────────────────

type SetCardProps = {
  entry: ScheduleEntry;
  setlistResult: ArtistShowResult | null;
  nowMinutes: number;
  isLiveDay: boolean;
  isFinished: boolean;
  colors: ReturnType<typeof useColors>;
};

function SetCard({ entry, setlistResult, nowMinutes, isLiveDay, isFinished, colors }: SetCardProps) {
  const s = styles(colors);
  const { getBreakpoint, setBreakpoint, removeBreakpoint } = useBreakpoints();
  const { toggleBand } = useLineup();
  const startMin = toMinutes(entry.startTime);
  const endMin = toMinutes(entry.endTime);
  const duration = endMin - startMin;

  const isPlaying = isLiveDay && nowMinutes >= startMin && nowMinutes < endMin;
  const minsRemaining = isPlaying ? endMin - nowMinutes : 0;
  const [expanded, setExpanded] = useState(isPlaying);
  const [sheetOpen, setSheetOpen] = useState(false);
  const songs = setlistResult?.latestSetlist?.sections.flatMap((sec) => sec.songs) ?? [];
  const breakpoint = getBreakpoint(entry.artist);

  const breakpointLabel = (() => {
    if (!breakpoint) return null;
    if (breakpoint.type === "song" && breakpoint.songIndex != null && songs.length > 0) {
      const song = songs[breakpoint.songIndex];
      return song ? `Leaving after "${song}"` : null;
    }
    if (breakpoint.departureTime) {
      const [h, m] = breakpoint.departureTime.split(":").map(Number);
      return `Leaving at ${formatTime(h * 60 + m)}`;
    }
    return null;
  })();

  const setCardArrivalLabel = (() => {
    if (!breakpoint || breakpoint.arrivalSongIndex == null) return null;
    const song = songs[breakpoint.arrivalSongIndex];
    if (!song) return null;
    const arrMin = startMin + (breakpoint.arrivalSongIndex / songs.length) * duration;
    return `📍 Must see "${song}" · ${formatTime(arrMin)}`;
  })();

  return (
    <TouchableOpacity
      style={[s.card, isFinished && s.cardFinished]}
      onLongPress={() => setSheetOpen(true)}
      delayLongPress={400}
      activeOpacity={1}
    >
      <TouchableOpacity
        style={s.cardHeader}
        onPress={() => setExpanded((v) => !v)}
        onLongPress={() => setSheetOpen(true)}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <Text style={s.artistName} numberOfLines={1}>{entry.artist}</Text>
        {setlistResult?.selectionMode === "festivalVenuePriority" && (
          <FontAwesome name="star" size={12} color={colors.success} />
        )}
        {setlistResult?.selectionMode === "recencyFallback" && (
          <FontAwesome name="clock-o" size={12} color={colors.textMuted} />
        )}
        {breakpoint && (
          <FontAwesome name="flag" size={12} color={colors.primary} />
        )}
        {isPlaying && (
          <View style={s.liveBadge}>
            <Text style={s.liveBadgeText}>LIVE</Text>
          </View>
        )}
        <FontAwesome name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textMuted} />
      </TouchableOpacity>

      <Text style={s.stageLine}>
        <Text style={s.stageName}>{entry.stage}</Text>
        <Text style={s.stageTime}> · {formatTime(startMin)} – {formatTime(endMin)}</Text>
      </Text>

      {breakpointLabel && (
        <Text style={s.breakpointLabel}>{breakpointLabel}</Text>
      )}
      {setCardArrivalLabel && (
        <Text style={s.arrivalLabel}>{setCardArrivalLabel}</Text>
      )}

      {isPlaying && (
        <Text style={s.minsRemaining}>{minsRemaining} min remaining</Text>
      )}

      {sheetOpen && (
        <BreakpointSheet
          entry={entry}
          setlistResult={setlistResult}
          existing={breakpoint ?? null}
          onSave={setBreakpoint}
          onDelete={() => removeBreakpoint(entry.artist)}
          onDropArtist={() => toggleBand(entry.artist)}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {expanded && (
        <>
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
                  <View key={i} style={[s.songRow, status === "played" && s.songRowDim]}>
                    <Text style={[
                      s.songTime,
                      status === "current" && s.songTimeCurrent,
                      status === "played" && s.songTimeDim,
                    ]}>
                      {formatTime(songMin)}
                    </Text>
                    <Text style={[
                      s.songName,
                      status === "current" && s.songNameCurrent,
                      status === "played" && s.songNameDim,
                    ]} numberOfLines={1}>
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
    </TouchableOpacity>
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

    // Conflict card
    conflictCard: {
      backgroundColor: colors.card, borderRadius: radii.md,
      borderWidth: 1, borderColor: colors.error,
      marginBottom: spacing.md, overflow: "hidden",
    },
    conflictCardHeader: {
      flexDirection: "row", alignItems: "center", gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderBottomWidth: 1, borderBottomColor: colors.error,
      backgroundColor: colors.cardSecondary,
    },
    conflictCardTitle: {
      color: colors.error, fontSize: fontSizes.xs, fontWeight: "700", letterSpacing: 0.5, flex: 1,
    },
    conflictCardTime: { color: colors.textMuted, fontSize: fontSizes.xs },
    conflictColumns: {
      flexDirection: "row", alignItems: "flex-start", padding: spacing.sm,
    },
    conflictColumnTouchable: { flex: 1 },
    conflictColumnExpanded: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    columnDivider: { width: 1, backgroundColor: colors.divider, alignSelf: "stretch", marginHorizontal: spacing.xs },
    conflictColumn: { paddingHorizontal: spacing.xs },
    columnArtist: { color: colors.text, fontSize: fontSizes.sm, fontWeight: "700", marginBottom: 2 },
    columnStage: { color: colors.primary, fontSize: fontSizes.xs, fontWeight: "600", marginBottom: 2 },
    columnTime: { color: colors.textMuted, fontSize: fontSizes.xs, marginBottom: spacing.xs },
    columnMinsLeft: { color: colors.success, fontSize: fontSizes.xs, fontWeight: "600", marginBottom: spacing.xs },
    columnSongs: { gap: 2 },
    columnSong: { color: colors.text, fontSize: fontSizes.xs },
    columnSongCurrent: { color: colors.success, fontWeight: "700" },
    columnSongPlayed: { color: colors.textMuted, opacity: 0.4 },
    columnSongAfterBreakpoint: { opacity: 0.3 },
    columnSongMissed: { opacity: 0.25 },
    columnSongBeforeArrival: { opacity: 0.3 },
    columnSongArrival: { color: colors.success, fontWeight: "700" as const },
    columnBreakpoint: { color: colors.primary, fontSize: fontSizes.xs, fontWeight: "600", marginBottom: 2 },
    columnArrivalMustSee: { color: colors.success, fontSize: fontSizes.xs, fontWeight: "600", marginBottom: 2 },
    columnArrival: { color: colors.success, fontSize: fontSizes.xs, fontWeight: "600", marginBottom: 2 },
    columnLeaveBy: { color: colors.primary, fontSize: fontSizes.xs, fontWeight: "600", marginBottom: 2 },
    columnSongAfterLeaveBy: { opacity: 0.3 },
    leaveByDivider: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.xs, marginVertical: spacing.xs },
    leaveByDividerLine: { flex: 1, height: 1, backgroundColor: colors.primary, opacity: 0.4 },
    leaveByDividerText: { color: colors.primary, fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.5 },
    arrivalDivider: {
      flexDirection: "row", alignItems: "center", gap: spacing.xs,
      marginVertical: spacing.xs,
    },
    arrivalDividerLine: { flex: 1, height: 1, backgroundColor: colors.success, opacity: 0.4 },
    arrivalDividerText: { color: colors.success, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
    columnNoSetlist: { color: colors.textMuted, fontSize: fontSizes.xs, fontStyle: "italic" },
    columnTextCentered: { textAlign: "center" as const },
    columnSongsCentered: { alignItems: "center" as const },

    // Set card
    card: {
      backgroundColor: colors.card, borderRadius: radii.md,
      padding: spacing.md, marginBottom: spacing.md,
    },
    cardFinished: { opacity: 0.45 },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
    artistName: { flex: 1, color: colors.text, fontSize: fontSizes.md, fontWeight: "700" },
    liveBadge: {
      backgroundColor: colors.success, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 2,
    },
    liveBadgeText: { color: "#FFFFFF", fontSize: fontSizes.xs, fontWeight: "700", letterSpacing: 0.5 },
    stageLine: { fontSize: fontSizes.sm, marginBottom: spacing.xs },
    stageName: { color: colors.primary, fontWeight: "700" },
    stageTime: { color: colors.textMuted, fontWeight: "400" },
    breakpointLabel: {
      color: colors.primary,
      fontSize: fontSizes.xs,
      fontWeight: "600" as const,
      marginTop: 2,
      marginBottom: 2,
    },
    arrivalLabel: {
      color: colors.success,
      fontSize: fontSizes.xs,
      fontWeight: "600" as const,
      marginBottom: spacing.xs,
    },
    minsRemaining: { color: colors.success, fontSize: fontSizes.xs, fontWeight: "600", marginBottom: spacing.xs },
    songList: { marginTop: spacing.sm, gap: 2 },
    songRow: { flexDirection: "row", gap: spacing.sm },
    songRowDim: { opacity: 0.35 },
    songTime: { color: colors.textMuted, fontSize: fontSizes.xs, width: 72 },
    songTimeCurrent: { color: colors.success, fontWeight: "700" },
    songTimeDim: { color: colors.textMuted },
    songName: { flex: 1, color: colors.text, fontSize: fontSizes.xs },
    songNameCurrent: { color: colors.success, fontWeight: "700" },
    songNameDim: { color: colors.textMuted },
    noSetlist: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: spacing.sm, fontStyle: "italic" },
  });
