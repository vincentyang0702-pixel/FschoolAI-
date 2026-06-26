import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SystemUI from "expo-system-ui";

const BG = "#0f0f0f";

export default function RootLayout() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(BG);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaProvider style={{ backgroundColor: BG }}>
        <StatusBar style="light" backgroundColor={BG} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: BG },
            animation: "none",
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
