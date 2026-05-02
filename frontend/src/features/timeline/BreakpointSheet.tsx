import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
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

type Props = {
  entry: ScheduleEntry;
  setlistResult: ArtistShowResult | null;
  existing: BreakpointRow | null;
  onSave: (bp: BreakpointRow) => void;
  onDelete: () => void;
  onDropArtist: () => void;
  onClose: () => void;
};

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

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function BreakpointSheet({ entry, setlistResult, existing, onSave, onDelete, onDropArtist, onClose }: Props) {
  const colors = useColors();
  const s = styles(colors);

  const songs = setlistResult?.latestSetlist?.sections.flatMap((sec) => sec.songs) ?? [];
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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }),
    ]).start(onClose);
  };

  const canSave = activeTab === "song" ? selectedSongIndex != null || arrivalSongIndex != null : selectedTime != null;

  const handleSongTap = (i: number) => {
    if (selectedSongIndex === i) {
      // departure → arrival
      setSelectedSongIndex(null);
      setArrivalSongIndex(i);
    } else if (arrivalSongIndex === i) {
      // arrival → clear
      setArrivalSongIndex(null);
    } else {
      // none → departure
      setSelectedSongIndex(i);
    }
  };

  const handleSave = () => {
    if (activeTab === "song") {
      const depIdx = selectedSongIndex;
      const nextSongMin = depIdx != null && depIdx + 1 < songs.length
        ? startMin + ((depIdx + 1) / songs.length) * duration
        : depIdx != null ? endMin : null;
      onSave({
        artist: entry.artist,
        type: "song",
        songIndex: depIdx,
        departureTime: nextSongMin != null ? minutesToHHMM(nextSongMin) : null,
        arrivalSongIndex: arrivalSongIndex,
      });
    } else if (activeTab === "time" && selectedTime != null) {
      onSave({
        artist: entry.artist,
        type: "time",
        songIndex: null,
        departureTime: selectedTime,
        arrivalSongIndex: null,
      });
    }
    dismiss();
  };

  const handleDelete = () => {
    onDelete();
    dismiss();
  };

  // Build time slots at 5-min intervals for the set
  const timeSlots: string[] = [];
  for (let m = startMin + 5; m < endMin; m += 5) {
    timeSlots.push(minutesToHHMM(m));
  }

  return (
    <Modal transparent animationType="none" onRequestClose={dismiss}>
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
      </Animated.View>

      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerText}>
            <Text style={s.headerTitle}>Breakpoint</Text>
            <Text style={s.headerArtist} numberOfLines={1}>{entry.artist}</Text>
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <FontAwesome name="times" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {hasSongs && (
            <TouchableOpacity
              style={[s.tab, activeTab === "song" && s.tabActive]}
              onPress={() => setActiveTab("song")}
            >
              <Text style={[s.tabText, activeTab === "song" && s.tabTextActive]}>By Song</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.tab, activeTab === "time" && s.tabActive]}
            onPress={() => setActiveTab("time")}
          >
            <Text style={[s.tabText, activeTab === "time" && s.tabTextActive]}>By Time</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={s.scrollArea} contentContainerStyle={s.scrollContent}>
          {activeTab === "song" && hasSongs && (
            <>
              <Text style={s.songHint}>Tap to cycle: departure 🚩 → arrive 📍 → clear</Text>
              {songs.map((song, i) => {
                const songMin = startMin + (i / songs.length) * duration;
                const nextMin = i + 1 < songs.length
                  ? startMin + ((i + 1) / songs.length) * duration
                  : endMin;
                const isDeparture = selectedSongIndex === i;
                const isArrival = arrivalSongIndex === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.row, isDeparture && s.rowSelected, isArrival && s.rowArrival]}
                    onPress={() => handleSongTap(i)}
                    activeOpacity={0.7}
                  >
                    <View style={s.rowLeft}>
                      <Text style={s.rowTime}>{formatTime(songMin)}</Text>
                      <Text
                        style={[s.rowLabel, isDeparture && s.rowLabelSelected, isArrival && s.rowLabelArrival]}
                        numberOfLines={1}
                      >
                        {song}
                      </Text>
                    </View>
                    <View style={s.rowRight}>
                      {isDeparture && <Text style={s.rowDeparture}>leave ~{formatTime(nextMin)}</Text>}
                      {isArrival && <Text style={s.rowArrivalLabel}>must arrive</Text>}
                      {isDeparture && <FontAwesome name="flag" size={14} color={colors.primary} />}
                      {isArrival && <FontAwesome name="map-marker" size={14} color={colors.success} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {activeTab === "time" && timeSlots.map((slot) => {
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
                <Text style={[s.rowTimeOnly, selected && s.rowLabelSelected]}>{formatTime(mins)}</Text>
                {selected && <FontAwesome name="flag" size={14} color={colors.primary} />}
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
          <TouchableOpacity style={s.dropBtn} onPress={() => { onDropArtist(); dismiss(); }}>
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
      maxHeight: "80%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    headerText: { flex: 1 },
    headerTitle: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontWeight: "600",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    headerArtist: {
      color: colors.text,
      fontSize: fontSizes.lg,
      fontWeight: "700",
      marginTop: 2,
    },
    tabs: {
      flexDirection: "row",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    tab: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
    },
    tabActive: { backgroundColor: colors.cardSecondary },
    tabText: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: "600" },
    tabTextActive: { color: colors.text },
    scrollArea: { maxHeight: 320 },
    scrollContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
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
    songHint: { color: colors.textMuted, fontSize: fontSizes.xs, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    rowLabelArrival: { color: colors.success, fontWeight: "600" as const },
    rowArrivalLabel: { color: colors.success, fontSize: fontSizes.xs },
    rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
    rowRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    rowTime: { color: colors.textMuted, fontSize: fontSizes.xs, width: 72 },
    rowTimeOnly: { flex: 1, color: colors.text, fontSize: fontSizes.md },
    rowLabel: { flex: 1, color: colors.text, fontSize: fontSizes.sm },
    rowLabelSelected: { color: colors.primary, fontWeight: "600" },
    rowDeparture: { color: colors.textMuted, fontSize: fontSizes.xs },
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
    dropBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    dropBtnText: { color: colors.error, fontSize: fontSizes.sm },
    deleteBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.error,
      alignItems: "center",
    },
    deleteBtnText: { color: colors.error, fontSize: fontSizes.sm, fontWeight: "600" },
    saveBtn: {
      flex: 2,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: "#fff", fontSize: fontSizes.sm, fontWeight: "700" },
  });
