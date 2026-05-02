import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { useBreakpoints } from "@/src/providers/breakpoints/BreakpointProvider";
import { useLineup } from "@/src/providers/lineup/LineupProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { toMinutes, formatTime } from "@/src/utils/time";
import { ArtistShowResult } from "@/src/shared/Types";
import { ScheduleEntry } from "@/src/data/schedule";
import { BreakpointSheet } from "./BreakpointSheet";

type SetCardProps = {
  entry: ScheduleEntry;
  setlistResult: ArtistShowResult | null;
  nowMinutes: number;
  isLiveDay: boolean;
  isFinished: boolean;
};

export function SetCard({ entry, setlistResult, nowMinutes, isLiveDay, isFinished }: SetCardProps) {
  const colors = useColors();
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

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
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
