import React, { useRef, useState } from "react";
import { Image, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { fontSizes, radii, spacing } from "@/src/theme";
import { useLineup } from "@/src/providers/lineup/LineupProvider";

export function ArtistsScreen() {
  const colors = useColors();
  const { lineup, isSelected, toggleBand, selectDay, deselectDay } = useLineup();
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<TextInput>(null);
  const s = styles(colors);

  const isSearching = searchQuery.trim().length > 0;
  const query = searchQuery.trim().toLowerCase();

  const toggleCollapsed = (day: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  };

  const sections = lineup
    .map((day) => ({
      title: day.day,
      data: isSearching
        ? day.bands.filter((b) => b.toLowerCase().includes(query))
        : collapsedDays.has(day.day) ? [] : day.bands,
    }))
    .filter((section) => !isSearching || section.data.length > 0);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <Image
        source={require("../../../assets/images/sonic-temple-logo.png")}
        style={s.logo}
        resizeMode="contain"
      />

      <View style={s.searchBar}>
        <FontAwesome name="search" size={14} color={colors.textMuted} />
        <TextInput
          ref={searchRef}
          style={s.searchInput}
          placeholder="Search artists..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {isSearching && (
          <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {!isSearching && (
        <View style={s.bulkActions}>
          <TouchableOpacity onPress={() => setCollapsedDays(new Set())}>
            <Text style={s.bulkActionText}>Expand All</Text>
          </TouchableOpacity>
          <Text style={s.bulkActionDivider}>·</Text>
          <TouchableOpacity onPress={() => setCollapsedDays(new Set(lineup.map((d) => d.day)))}>
            <Text style={s.bulkActionText}>Collapse All</Text>
          </TouchableOpacity>
        </View>
      )}

      <SectionList
        style={s.container}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        sections={sections}
        keyExtractor={(item) => item}
        renderSectionHeader={({ section }) => {
          const collapsed = collapsedDays.has(section.title);
          return (
            <TouchableOpacity
              style={s.dayHeader}
              onPress={() => toggleCollapsed(section.title)}
              activeOpacity={0.7}
            >
              <View style={s.dayLeft}>
                <FontAwesome
                  name={collapsed ? "chevron-down" : "chevron-up"}
                  size={14}
                  color={colors.textMuted}
                  style={s.chevron}
                />
                <Text style={s.dayHeaderText}>
                  {section.title}{" "}
                  <Text style={s.dayCount}>
                    ({lineup.find((d) => d.day === section.title)!.bands.filter(isSelected).length})
                  </Text>
                </Text>
              </View>
              <View style={s.dayActions}>
                <TouchableOpacity
                  style={s.dayActionBtn}
                  onPress={() => selectDay(section.title)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <FontAwesome name="check-square-o" size={22} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.dayActionBtn}
                  onPress={() => deselectDay(section.title)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <FontAwesome name="square-o" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        renderItem={({ item }) => {
          const selected = isSelected(item);
          return (
            <TouchableOpacity
              style={[s.row, selected && s.rowSelected]}
              onPress={() => toggleBand(item)}
              activeOpacity={0.7}
            >
              <Text style={[s.bandName, !selected && s.bandNameDim]}>{item}</Text>
              <View style={[s.checkbox, selected && s.checkboxSelected]}>
                {selected && <Text style={s.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
        stickySectionHeadersEnabled
      />
    </SafeAreaView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    logo: {
      width: "100%",
      height: 130,
      marginBottom: spacing.xs,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: radii.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: fontSizes.md,
      padding: 0,
    },
    bulkActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
    },
    bulkActionText: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
      fontWeight: "600",
    },
    bulkActionDivider: {
      color: colors.textMuted,
      fontSize: fontSizes.xs,
    },
    dayHeader: {
      backgroundColor: colors.background,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      marginBottom: spacing.xs,
      minHeight: 44,
    },
    dayLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    dayHeaderText: {
      color: colors.primary,
      fontSize: fontSizes.lg,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    dayCount: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: "400",
    },
    dayActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    dayActionBtn: {
      minHeight: 44,
      minWidth: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    chevron: {},
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.card,
      borderRadius: radii.md,
      minHeight: 44,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
      opacity: 0.5,
    },
    rowSelected: {
      opacity: 1,
    },
    bandName: {
      color: colors.text,
      fontSize: fontSizes.md,
      flex: 1,
    },
    bandNameDim: {
      color: colors.textMuted,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: spacing.sm,
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkmark: {
      color: colors.card,
      fontSize: fontSizes.xs,
      fontWeight: "700",
    },
  });
