import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { BreakpointRow } from "@/src/services/db";
import { ArtistShowResult } from "@/src/shared/Types";
import { ScheduleEntry } from "@/src/data/schedule";
import {
  scheduleBreakpointNotifications,
  cancelBreakpointNotifications,
} from "@/src/services/notifications";
import { toMinutes, formatTime, minutesToHHMM } from "@/src/utils/time";

type Props = {
  entry: ScheduleEntry;
  setlistResult: ArtistShowResult | null;
  existing: BreakpointRow | null;
  onSave: (bp: BreakpointRow) => void;
  onDelete: () => void;
  onDropArtist: () => void;
  onClose: () => void;
};

function buildSetlistUrl(result: ArtistShowResult): string | null {
  if (result.artistMatch?.url) return result.artistMatch.url;
  if (result.artistMatch?.mbid && result.artistMatch?.name) {
    const slug = result.artistMatch.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const mbidShort = result.artistMatch.mbid.split("-")[0];
    return `https://www.setlist.fm/setlists/${slug}-${mbidShort}.html`;
  }
  return null;
}

// setlist.fm returns dates as DD-MM-YYYY
function formatEventDate(dateStr: string): string {
  const [day, month, year] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BreakpointSheet({
  entry,
  setlistResult,
  existing,
  onSave,
  onDelete,
  onDropArtist,
  onClose,
}: Props) {
  const colors = useColors();
  const s = styles(colors);

  const songs =
    setlistResult?.latestSetlist?.sections.flatMap((sec) => sec.songs) ?? [];
  const hasSongs = songs.length > 0;
  const startMin = toMinutes(entry.startTime);
  const endMin = toMinutes(entry.endTime);
  const duration = endMin - startMin;

  const [activeTab, setActiveTab] = useState<"song" | "time">(
    existing?.type === "time" || !hasSongs ? "time" : "song"
  );
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(
    existing?.type === "song" ? (existing.songIndex ?? null) : null
  );
  const [arrivalSongIndex, setArrivalSongIndex] = useState<number | null>(
    existing?.arrivalSongIndex ?? null
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(
    existing?.type === "time" ? (existing.departureTime ?? null) : null
  );

  const slideAnim = useRef(new Animated.Value(400)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef<() => void>(() => {});

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 2,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) slideAnim.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          dismissRef.current();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 65,
            friction: 11,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(onClose);
  };
  dismissRef.current = dismiss;

  const canSave =
    activeTab === "song"
      ? selectedSongIndex != null || arrivalSongIndex != null
      : selectedTime != null;

  const handleSongTap = (i: number) => {
    if (selectedSongIndex === i) {
      setSelectedSongIndex(null);
      setArrivalSongIndex(i);
    } else if (arrivalSongIndex === i) {
      setArrivalSongIndex(null);
    } else {
      setSelectedSongIndex(i);
    }
  };

  const handleSave = () => {
    let bp: BreakpointRow | null = null;
    if (activeTab === "song") {
      const depIdx = selectedSongIndex;
      const nextSongMin =
        depIdx != null && depIdx + 1 < songs.length
          ? startMin + ((depIdx + 1) / songs.length) * duration
          : depIdx != null
          ? endMin
          : null;
      bp = {
        artist: entry.artist,
        type: "song",
        songIndex: depIdx,
        departureTime: nextSongMin != null ? minutesToHHMM(nextSongMin) : null,
        arrivalSongIndex: arrivalSongIndex,
      };
    } else if (activeTab === "time" && selectedTime != null) {
      bp = {
        artist: entry.artist,
        type: "time",
        songIndex: null,
        departureTime: selectedTime,
        arrivalSongIndex: null,
      };
    }
    if (bp) {
      onSave(bp);
      scheduleBreakpointNotifications(entry, bp, songs);
    }
    dismiss();
  };

  const handleDelete = () => {
    cancelBreakpointNotifications(entry.artist);
    onDelete();
    dismiss();
  };

  const timeSlots: string[] = [];
  for (let m = startMin + 5; m < endMin; m += 5) {
    timeSlots.push(minutesToHHMM(m));
  }

  const setlistUrl = setlistResult ? buildSetlistUrl(setlistResult) : null;
  const setlist = setlistResult?.latestSetlist;
  const isFestival = setlistResult?.selectionMode === "festivalVenuePriority";

  const metaParts: string[] = [];
  if (setlist?.cityName) metaParts.push(setlist.cityName);
  if (setlist?.eventDate) metaParts.push(formatEventDate(setlist.eventDate));
  if (setlist?.songCount) metaParts.push(`${setlist.songCount} songs`);

  return (
    <Modal transparent animationType="none" onRequestClose={dismiss}>
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Drag handle */}
        <View style={s.dragHandleArea} {...panResponder.panHandlers}>
          <View style={s.dragPill} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.artistName} numberOfLines={1}>
              {entry.artist}
            </Text>
            <Text style={s.setInfo}>
              {entry.stage} · {entry.day} · {formatTime(startMin)}–
              {formatTime(endMin)}
            </Text>
          </View>
          <View style={s.headerActions}>
            {setlistUrl && (
              <TouchableOpacity
                onPress={() => WebBrowser.openBrowserAsync(setlistUrl)}
                hitSlop={{ top: 10, bottom: 10, left: 12, right: 4 }}
                style={s.linkBtn}
              >
                <FontAwesome
                  name="external-link"
                  size={15}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}
            >
              <FontAwesome name="times" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Setlist metadata strip */}
        <View style={s.metaStrip}>
          {setlist ? (
            <>
              <View style={[s.badge, isFestival ? s.badgeFestival : s.badgeRecent]}>
                <Text
                  style={[
                    s.badgeText,
                    isFestival ? s.badgeTextFestival : s.badgeTextRecent,
                  ]}
                >
                  {isFestival ? "Festival" : "Recent"}
                </Text>
              </View>
              <Text style={s.metaText} numberOfLines={1}>
                {metaParts.join(" · ")}
              </Text>
            </>
          ) : (
            <Text style={s.metaEmpty}>No setlist data</Text>
          )}
        </View>

        {/* When to leave */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>When to leave</Text>
          {activeTab === "song" && hasSongs && (
            <Text style={s.sectionHint}>
              Tap to cycle: leave 🚩 → arrive 📍 → clear
            </Text>
          )}
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {hasSongs && (
            <TouchableOpacity
              style={[s.tab, activeTab === "song" && s.tabActive]}
              onPress={() => setActiveTab("song")}
            >
              <Text
                style={[s.tabText, activeTab === "song" && s.tabTextActive]}
              >
                By Song
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.tab, activeTab === "time" && s.tabActive]}
            onPress={() => setActiveTab("time")}
          >
            <Text
              style={[s.tabText, activeTab === "time" && s.tabTextActive]}
            >
              By Time
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={s.scrollArea}
          contentContainerStyle={s.scrollContent}
        >
          {activeTab === "song" &&
            hasSongs &&
            songs.map((song, i) => {
              const songMin = startMin + (i / songs.length) * duration;
              const nextMin =
                i + 1 < songs.length
                  ? startMin + ((i + 1) / songs.length) * duration
                  : endMin;
              const isDeparture = selectedSongIndex === i;
              const isArrival = arrivalSongIndex === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.row,
                    isDeparture && s.rowSelected,
                    isArrival && s.rowArrival,
                  ]}
                  onPress={() => handleSongTap(i)}
                  activeOpacity={0.7}
                >
                  <View style={s.rowLeft}>
                    <Text style={s.rowTime}>{formatTime(songMin)}</Text>
                    <Text
                      style={[
                        s.rowLabel,
                        isDeparture && s.rowLabelSelected,
                        isArrival && s.rowLabelArrival,
                      ]}
                      numberOfLines={1}
                    >
                      {song}
                    </Text>
                  </View>
                  <View style={s.rowRight}>
                    {isDeparture && (
                      <Text style={s.rowDeparture}>
                        leave ~{formatTime(nextMin)}
                      </Text>
                    )}
                    {isArrival && (
                      <Text style={s.rowArrivalLabel}>must arrive</Text>
                    )}
                    {isDeparture && (
                      <FontAwesome
                        name="flag"
                        size={14}
                        color={colors.primary}
                      />
                    )}
                    {isArrival && (
                      <FontAwesome
                        name="map-marker"
                        size={14}
                        color={colors.success}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

          {activeTab === "time" &&
            timeSlots.map((slot) => {
              const [h, m] = slot.split(":").map(Number);
              const mins = h * 60 + m;
              const selected = selectedTime === slot;
              return (
                <TouchableOpacity
                  key={slot}
                  style={[s.row, selected && s.rowSelected]}
                  onPress={() => setSelectedTime(slot)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.rowTimeOnly, selected && s.rowLabelSelected]}>
                    {formatTime(mins)}
                  </Text>
                  {selected && (
                    <FontAwesome
                      name="flag"
                      size={14}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
        </ScrollView>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerTop}>
            {existing && (
              <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
                <Text style={s.deleteBtnText}>Remove</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={s.saveBtnText}>Save Breakpoint</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={s.dropBtn}
            onPress={() => {
              onDropArtist();
              dismiss();
            }}
          >
            <FontAwesome name="times-circle" size={13} color={colors.error} />
            <Text style={s.dropBtnText}>Drop {entry.artist} from my lineup</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      maxHeight: "85%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 10,
    },
    // Drag handle
    dragHandleArea: {
      alignItems: "center",
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    dragPill: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.divider,
    },
    // Header
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerLeft: { flex: 1 },
    artistName: {
      color: colors.text,
      fontSize: fontSizes.xl,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    setInfo: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      marginTop: 3,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingTop: 2,
    },
    linkBtn: {},
    // Metadata strip
    metaStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.sm,
    },
    badgeFestival: {
      backgroundColor: "#F5C40028",
    },
    badgeRecent: {
      backgroundColor: colors.cardSecondary,
    },
    badgeText: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    badgeTextFestival: {
      color: "#A07A00",
    },
    badgeTextRecent: {
      color: colors.textMuted,
    },
    metaText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: fontSizes.xs,
    },
    metaEmpty: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontStyle: "italic",
    },
    // Section header
    sectionHeader: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
      gap: 2,
    },
    sectionTitle: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
    },
    // Tabs
    tabs: {
      flexDirection: "row",
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
      gap: spacing.sm,
    },
    tab: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
    },
    tabActive: { backgroundColor: colors.cardSecondary },
    tabText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: "600",
    },
    tabTextActive: { color: colors.text },
    // Scroll content
    scrollArea: { maxHeight: 300 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      marginBottom: 2,
    },
    rowSelected: { backgroundColor: colors.cardSecondary },
    rowArrival: { backgroundColor: colors.success + "18" },
    rowLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    rowTime: { color: colors.textMuted, fontSize: fontSizes.xs, width: 72 },
    rowTimeOnly: { flex: 1, color: colors.text, fontSize: fontSizes.md },
    rowLabel: { flex: 1, color: colors.text, fontSize: fontSizes.sm },
    rowLabelSelected: { color: colors.primary, fontWeight: "600" },
    rowLabelArrival: { color: colors.success, fontWeight: "600" },
    rowDeparture: { color: colors.textMuted, fontSize: fontSizes.xs },
    rowArrivalLabel: { color: colors.success, fontSize: fontSizes.xs },
    // Footer
    footer: {
      gap: spacing.sm,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    footerTop: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    saveBtn: {
      flex: 2,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: {
      color: "#fff",
      fontSize: fontSizes.sm,
      fontWeight: "700",
    },
    deleteBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.error,
      alignItems: "center",
    },
    deleteBtnText: {
      color: colors.error,
      fontSize: fontSizes.sm,
      fontWeight: "600",
    },
    dropBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    dropBtnText: { color: colors.error, fontSize: fontSizes.sm },
  });
