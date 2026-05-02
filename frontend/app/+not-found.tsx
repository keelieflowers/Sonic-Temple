import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/src/providers/theme/ThemeProvider";

export default function NotFoundScreen() {
  const colors = useColors();
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text }]}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 20, fontWeight: "bold" },
  link: { marginTop: 15, paddingVertical: 15 },
  linkText: { fontSize: 14 },
});
