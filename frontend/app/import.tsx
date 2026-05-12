import { useEffect } from "react";
import { Alert, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { usePartnerLineup } from "@/src/providers/partnerLineup/PartnerLineupProvider";
import { useColors } from "@/src/providers/theme/ThemeProvider";

export default function ImportScreen() {
  const colors = useColors();
  const rawParams = useLocalSearchParams<{ d: string }>();
  // Expo Router may return string | string[] for query params; always take the first value.
  const d = Array.isArray(rawParams.d) ? rawParams.d[0] : rawParams.d;
  const { importPartnerBands } = usePartnerLineup();
  const router = useRouter();

  useEffect(() => {
    async function handle() {
      if (!d) {
        router.replace("/(tabs)");
        return;
      }

      try {
        // Expo Router typically URL-decodes query params, but decode defensively.
        let parsed: unknown;
        try {
          parsed = JSON.parse(d);
        } catch {
          parsed = JSON.parse(decodeURIComponent(d));
        }

        const bands: unknown = (parsed as Record<string, unknown>)?.bands;
        if (!Array.isArray(bands) || bands.some((b) => typeof b !== "string")) {
          throw new Error("bad format");
        }

        await importPartnerBands(bands as string[]);
        Alert.alert(
          "Partner lineup imported",
          `${bands.length} artist${bands.length === 1 ? "" : "s"} loaded.`,
          [{ text: "OK", onPress: () => router.replace("/(tabs)") }]
        );
      } catch {
        Alert.alert(
          "Invalid link",
          "This link doesn't contain a valid Sonic Temple lineup.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)") }]
        );
      }
    }

    handle();
  }, [d, importPartnerBands, router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "none" }} />
      <View style={{ flex: 1, backgroundColor: colors.background }} />
    </>
  );
}
