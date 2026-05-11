import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Notifications from "expo-notifications";
import { clearSetlistCache } from "@/src/services/db";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { useLineup } from "@/src/providers/lineup/LineupProvider";
import { usePartnerLineup } from "@/src/providers/partnerLineup/PartnerLineupProvider";
import { useBreakpoints } from "@/src/providers/breakpoints/BreakpointProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { syncArtistSetlists } from "@/src/services/sync";
import { scheduleTestNotification, requestNotificationPermissions } from "@/src/services/notifications";

export function SettingsScreen() {
  const colors = useColors();
  const s = styles(colors);
  const queryClient = useQueryClient();
  const { selectedBands, clearAll: clearLineup } = useLineup();
  const { partnerBands, importPartnerBands, clearPartner } = usePartnerLineup();
  const { clearAll: clearBreakpoints } = useBreakpoints();

  const [importText, setImportText] = useState("");
  const [syncingSetlists, setSyncingSetlists] = useState(false);
  const [forceSyncingSetlists, setForceSyncingSetlists] = useState(false);
  const [scheduledNotifs, setScheduledNotifs] = useState<Notifications.NotificationRequest[]>([]);

  const loadScheduledNotifs = useCallback(async () => {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    setScheduledNotifs(all.sort((a, b) => {
      const aSeconds = (a.trigger as any).seconds ?? 0;
      const bSeconds = (b.trigger as any).seconds ?? 0;
      return aSeconds - bSeconds;
    }));
  }, []);

  useFocusEffect(useCallback(() => { loadScheduledNotifs(); }, [loadScheduledNotifs]));
  const [testingSent, setTestingSent] = useState(false);

  const handleTestNotification = async () => {
    const granted = await requestNotificationPermissions();
    if (!granted) {
      Alert.alert("Notifications blocked", "Enable notifications for Sonic Temple in Settings.");
      return;
    }
    await scheduleTestNotification();
    setTestingSent(true);
    loadScheduledNotifs();
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

  const handleForceBackendRefresh = async () => {
    const bandCount = selectedBands.size;
    if (bandCount === 0) {
      Alert.alert("No artists selected", "Select artists in the Artists tab first.");
      return;
    }
    setForceSyncingSetlists(true);
    try {
      await syncArtistSetlists([...selectedBands], undefined, true);
      await queryClient.invalidateQueries({ queryKey: ["all-cached-setlists"] });
      Alert.alert("Done", `Force-refreshed setlists for ${bandCount} artists.`);
    } catch {
      Alert.alert("Error", "Could not reach the backend. Is it running?");
    } finally {
      setForceSyncingSetlists(false);
    }
  };

  const handleExport = async () => {
    const payload = JSON.stringify({ bands: [...selectedBands] });
    await Share.share({ message: payload });
  };

  const handleImport = async () => {
    const text = importText.trim();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      const bands: unknown = parsed?.bands;
      if (!Array.isArray(bands) || bands.some((b) => typeof b !== "string")) {
        throw new Error("bad format");
      }
      await importPartnerBands(bands as string[]);
      setImportText("");
      Alert.alert("Imported", `${bands.length} artists loaded from partner lineup.`);
    } catch {
      Alert.alert("Invalid data", "Couldn't parse that. Make sure you pasted the full exported text.");
    }
  };

  const handleClearPartner = () => {
    Alert.alert("Clear partner lineup?", "This removes the imported picks from your view.", [
      { text: "Clear", style: "destructive", onPress: clearPartner },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleClearAllData = () => {
    Alert.alert(
      "Clear all data?",
      "This removes your selected artists, breakpoints, setlist cache, and partner lineup. This cannot be undone.",
      [
        {
          text: "Clear everything",
          style: "destructive",
          onPress: async () => {
            await Promise.all([
              clearLineup(),
              clearBreakpoints(),
              clearPartner(),
              clearSetlistCache(),
              Notifications.cancelAllScheduledNotificationsAsync(),
            ]);
            await queryClient.invalidateQueries({ queryKey: ["all-cached-setlists"] });
            loadScheduledNotifs();
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  function notifIcon(id: string) {
    if (id.startsWith("must-see-")) return { name: "star" as const, color: colors.warning };
    if (id.startsWith("bp-depart-")) return { name: "flag" as const, color: colors.primary };
    return { name: "map-marker" as const, color: colors.success };
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView contentContainerStyle={s.scrollContent}>
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

        {scheduledNotifs.length > 0 && (
          <View style={s.notifList}>
            {scheduledNotifs.map((n) => {
              const icon = notifIcon(n.identifier);
              const trigger = n.trigger as any;
              let triggerDate: Date | null = null;
              if (trigger.type === "timeInterval" && trigger.seconds) {
                triggerDate = new Date(Date.now() + trigger.seconds * 1000);
              }
              const timeStr = triggerDate
                ? triggerDate.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : null;
              return (
                <View key={n.identifier} style={s.notifRow}>
                  <FontAwesome name={icon.name} size={12} color={icon.color} style={s.notifIcon} />
                  <View style={s.notifText}>
                    <View style={s.notifTitleRow}>
                      <Text style={s.notifTitle} numberOfLines={1}>{n.content.title}</Text>
                      {timeStr && <Text style={s.notifTime}>{timeStr}</Text>}
                    </View>
                    {n.content.body && <Text style={s.notifBody} numberOfLines={1}>{n.content.body}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>PARTNER LINEUP</Text>

        <TouchableOpacity style={s.row} onPress={handleExport} activeOpacity={0.7}>
          <FontAwesome name="share" size={16} color={colors.primary} />
          <View style={s.rowText}>
            <Text style={s.rowLabel}>Export my picks</Text>
            <Text style={s.rowSub}>{selectedBands.size} artists · share via iMessage, AirDrop, etc.</Text>
          </View>
        </TouchableOpacity>

        {partnerBands.size > 0 && (
          <>
            <View style={s.divider} />
            <TouchableOpacity style={s.row} onPress={handleClearPartner} activeOpacity={0.7}>
              <FontAwesome name="user" size={16} color={colors.success} />
              <View style={s.rowText}>
                <Text style={s.rowLabel}>Partner picks loaded</Text>
                <Text style={s.rowSub}>{partnerBands.size} artists · tap to clear</Text>
              </View>
              <FontAwesome name="times" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        <View style={s.importBox}>
          <TextInput
            style={[s.importInput, { color: colors.text }]}
            placeholder="Paste partner export here…"
            placeholderTextColor={colors.textMuted}
            value={importText}
            onChangeText={setImportText}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
          />
          {importText.trim().length > 0 && (
            <TouchableOpacity style={s.importBtn} onPress={handleImport} activeOpacity={0.8}>
              <Text style={s.importBtnText}>Import</Text>
            </TouchableOpacity>
          )}
        </View>
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
          style={[s.row, forceSyncingSetlists && s.rowDisabled]}
          onPress={handleForceBackendRefresh}
          activeOpacity={0.7}
          disabled={forceSyncingSetlists}
        >
          {forceSyncingSetlists
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <FontAwesome name="refresh" size={16} color={colors.primary} />
          }
          <View style={s.rowText}>
            <Text style={s.rowLabel}>Force refresh setlists</Text>
            <Text style={s.rowSub} numberOfLines={1}>Bypass backend cache and pull latest from Setlist.fm for {selectedBands.size} artists</Text>
          </View>
        </TouchableOpacity>

        <View style={s.divider} />

        <TouchableOpacity style={s.row} onPress={handleClearAllData} activeOpacity={0.7}>
          <FontAwesome name="trash" size={16} color={colors.error} />
          <View style={s.rowText}>
            <Text style={[s.rowLabel, { color: colors.error }]}>Clear all data</Text>
            <Text style={s.rowSub}>Remove all artists, breakpoints, and cached setlists</Text>
          </View>
        </TouchableOpacity>
      </View>
      <Text style={s.versionLabel}>v{Constants.expoConfig?.version ?? "—"}</Text>
      </ScrollView>
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
    scrollContent: {
      paddingBottom: spacing.xl,
    },
    notifList: {
      marginHorizontal: spacing.md,
      marginTop: spacing.xs,
      backgroundColor: colors.card,
      borderRadius: radii.md,
      overflow: "hidden",
    },
    notifRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: spacing.sm,
    },
    notifIcon: { width: 16, textAlign: "center" },
    notifText: { flex: 1 },
    notifTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm },
    notifTitle: { color: colors.text, fontSize: fontSizes.sm, fontWeight: "500", flex: 1 },
    notifBody: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 1 },
    notifTime: { color: colors.textMuted, fontSize: fontSizes.xs },
    importBox: {
      marginHorizontal: spacing.md,
      marginTop: spacing.xs,
      backgroundColor: colors.card,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    importInput: {
      fontSize: fontSizes.sm,
      minHeight: 60,
      textAlignVertical: "top",
    },
    importBtn: {
      alignSelf: "flex-end",
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
    },
    importBtnText: {
      color: "#fff",
      fontSize: fontSizes.sm,
      fontWeight: "700",
    },
    versionLabel: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      textAlign: "center",
      paddingVertical: spacing.lg,
    },
  });
