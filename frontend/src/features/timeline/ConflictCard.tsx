import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { useBreakpoints } from "@/src/providers/breakpoints/BreakpointProvider";
import { useLineup } from "@/src/providers/lineup/LineupProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { toMinutes, formatTime, formatTimeShort } from "@/src/utils/time";
import { TRAVEL_MIN, PX_PER_MIN } from "@/src/constants/timing";
import { BreakpointRow } from "@/src/services/db";
import { ArtistShowResult } from "@/src/shared/Types";
import { ScheduleEntry } from "@/src/data/schedule";
import { BreakpointSheet } from "./BreakpointSheet";
import { ConflictItem } from "./timeline.types";

type ConflictCardProps = {
  item: ConflictItem;
  setlistMap: Map<string, ArtistShowResult>;
  nowMinutes: number;
  isLiveDay: boolean;
  isFinished: boolean;
};

export function ConflictCard({ item, setlistMap, nowMinutes, isLiveDay, isFinished }: ConflictCardProps) {
  const colors = useColors();
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

  // For each entry, compute arrival time implied by another entry's departure breakpoint
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
              <React.Fragment key={`${entry.artist}-${i}`}>
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
  breakpoint: BreakpointRow | null;
  arrivalMin: number | null;
  leaveBy: { min: number; songName: string } | null;
  expanded?: boolean;
};

function ConflictColumn({ entry, setlistResult, nowMinutes, isLiveDay, offsetPx, breakpoint, arrivalMin, leaveBy, expanded }: ConflictColumnProps) {
  const colors = useColors();
  const s = styles(colors);
  const startMin = toMinutes(entry.startTime);
  const endMin = toMinutes(entry.endTime);
  const duration = endMin - startMin;
  const isPlaying = isLiveDay && nowMinutes >= startMin && nowMinutes < endMin;
  const songs = setlistResult?.latestSetlist?.sections.flatMap((sec) => sec.songs) ?? [];

  const departureMin = (() => {
    if (!breakpoint?.departureTime) return null;
    const [h, m] = breakpoint.departureTime.split(":").map(Number);
    return h * 60 + m;
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

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    cardFinished: { opacity: 0.45 },
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
  });
