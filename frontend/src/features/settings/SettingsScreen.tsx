import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { useLineup } from "@/src/providers/lineup/LineupProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { syncArtistSetlists } from "@/src/services/sync";
import { refreshMbidCache } from "@/src/services/api";
import { scheduleTestNotification, requestNotificationPermissions } from "@/src/services/notifications";

export function SettingsScreen() {
  const colors = useColors();
  const s = styles(colors);
  const queryClient = useQueryClient();
  const { selectedBands } = useLineup();

  const [syncingSetlists, setSyncingSetlists] = useState(false);
  const [syncingMbids, setSyncingMbids] = useState(false);
  const [testingSent, setTestingSent] = useState(false);

  const handleTestNotification = async () => {
    const granted = await requestNotificationPermissions();
    if (!granted) {
      Alert.alert("Notifications blocked", "Enable notifications for Sonic Temple in Settings.");
      return;
    }
    await scheduleTestNotification();
    setTestingSent(true);
    setTimeout(() => setTestingSent(false), 6000);
  };

  const handleForceSetlistSync = async () => {
    const bandCount = selectedBands.size;
    if (bandCount === 0) {
      Alert.alert("No artists selected", "Select artists in the Artists tab first.");
      return;
    }
    setSyncingSetlists(true);
    try {
      await syncArtistSetlists([...selectedBands]);
      await queryClient.invalidateQueries({ queryKey: ["all-cached-setlists"] });
      Alert.alert("Done", `Synced setlists for ${bandCount} artists.`);
    } catch {
      Alert.alert("Error", "Setlist sync failed. Check your connection.");
    } finally {
      setSyncingSetlists(false);
    }
  };

  const handleRefreshMbids = async () => {
    setSyncingMbids(true);
    try {
      await refreshMbidCache();
      Alert.alert("Done", "MBID cache refreshed.");
    } catch {
      Alert.alert("Error", "Could not reach the backend. Is it running?");
    } finally {
      setSyncingMbids(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <Text style={s.screenTitle}>Settings</Text>

      <View style={s.section}>
        <Text style={s.sectionTitle}>NOTIFICATIONS</Text>

        <View style={s.card}>
          <Text style={s.cardBody}>
            Departure and arrival reminders are scheduled automatically when you save a breakpoint.
          </Text>
        </View>

        <TouchableOpacity style={s.row} onPress={handleTestNotification} activeOpacity={0.7}>
          <FontAwesome name="bell" size={16} color={testingSent ? colors.success : colors.primary} />
          <View style={s.rowText}>
            <Text style={s.rowLabel}>Send test notification</Text>
            <Text style={s.rowSub} numberOfLines={1}>
              {testingSent ? "Two sample alerts incoming — check your lock screen" : "Preview departure and arrival alerts on this device"}
            </Text>
          </View>
          {testingSent && <FontAwesome name="check" size={14} color={colors.success} />}
        </TouchableOpacity>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>DATA</Text>

        <TouchableOpacity
          style={[s.row, syncingSetlists && s.rowDisabled]}
          onPress={handleForceSetlistSync}
          activeOpacity={0.7}
          disabled={syncingSetlists}
        >
          {syncingSetlists
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <FontAwesome name="cloud-download" size={16} color={colors.primary} />
          }
          <View style={s.rowText}>
            <Text style={s.rowLabel}>Force sync setlists</Text>
            <Text style={s.rowSub} numberOfLines={1}>Re-fetch setlists for all {selectedBands.size} selected artists</Text>
          </View>
        </TouchableOpacity>

        <View style={s.divider} />

        <TouchableOpacity
          style={[s.row, syncingMbids && s.rowDisabled]}
          onPress={handleRefreshMbids}
          activeOpacity={0.7}
          disabled={syncingMbids}
        >
          {syncingMbids
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <FontAwesome name="refresh" size={16} color={colors.primary} />
          }
          <View style={s.rowText}>
            <Text style={s.rowLabel}>Refresh backend cache</Text>
            <Text style={s.rowSub} numberOfLines={1}>Force backend to re-fetch artist IDs and setlists from source</Text>
          </View>
        </TouchableOpacity>
      </View>
      <Text style={s.versionLabel}>v{Constants.expoConfig?.version ?? "—"}</Text>
    </SafeAreaView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screenTitle: {
      color: colors.text,
      fontSize: fontSizes.xl,
      fontWeight: "800",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontWeight: "700",
      letterSpacing: 0.8,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    card: {
      backgroundColor: colors.card,
      marginHorizontal: spacing.md,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.xs,
    },
    cardBody: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      marginHorizontal: spacing.md,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
      marginBottom: spacing.xs,
      height: 64,
    },
    rowDisabled: {
      opacity: 0.5,
    },
    rowText: {
      flex: 1,
    },
    rowLabel: {
      color: colors.text,
      fontSize: fontSizes.md,
      fontWeight: "600",
    },
    rowSub: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.divider,
      marginHorizontal: spacing.md + spacing.md + 16 + spacing.md,
    },
    versionLabel: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      textAlign: "center",
      paddingVertical: spacing.lg,
    },
  });
