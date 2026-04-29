import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@/src/providers/theme/ThemeProvider";
import { LineupProvider } from "@/src/providers/lineup/LineupProvider";
import { initDb } from "@/src/services/db";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    initDb().then(() => SplashScreen.hideAsync());
  }, []);

  return (
    <ThemeProvider>
      <LineupProvider>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="+not-found" />
              </Stack>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </QueryClientProvider>
      </LineupProvider>
    </ThemeProvider>
  );
}
