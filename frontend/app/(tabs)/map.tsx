import { useLocalSearchParams } from "expo-router";
import { SafeAreaView, StyleSheet } from "react-native";
import { MapScreen } from "@/src/features/map/MapScreen";
import { useColors } from "@/src/providers/theme/ThemeProvider";

export default function MapTab() {
  const colors = useColors();
  const { stage } = useLocalSearchParams<{ stage?: string }>();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <MapScreen highlightedStage={stage} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
