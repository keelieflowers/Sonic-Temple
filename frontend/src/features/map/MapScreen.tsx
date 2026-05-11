import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useColors } from "@/src/providers/theme/ThemeProvider";
import { fontSizes, spacing } from "@/src/theme";

// Coordinates as fractions of the 1024×1024 image. Tune as needed.
const STAGE_PINS = [
  { stage: "Temple Stage",    x: 0.82, y: 0.19 },
  { stage: "Altar Stage",     x: 0.12, y: 0.28 },
  { stage: "Citadel Stage",   x: 0.84, y: 0.40 },
  { stage: "Sanctuary Stage", x: 0.83, y: 0.46 },
  { stage: "Cathedral Stage", x: 0.41, y: 0.58 },
];

type Props = {
  highlightedStage?: string;
};

const ZOOM_HIGHLIGHT = 2.5;

export function MapScreen({ highlightedStage }: Props) {
  const colors = useColors();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const imageSize = screenW;

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 5);
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTX.value = translateX.value;
      savedTY.value = translateY.value;
    })
    .onUpdate((e) => {
      const maxTX = ((scale.value - 1) * imageSize) / 2;
      const maxTY = ((scale.value - 1) * imageSize) / 2;
      translateX.value = Math.min(Math.max(savedTX.value + e.translationX, -maxTX), maxTX);
      translateY.value = Math.min(Math.max(savedTY.value + e.translationY, -maxTY), maxTY);
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  useEffect(() => {
    if (!highlightedStage) {
      scale.value = withSpring(1, { damping: 15 });
      translateX.value = withSpring(0, { damping: 15 });
      translateY.value = withSpring(0, { damping: 15 });
      return;
    }
    const pin = STAGE_PINS.find((p) => p.stage === highlightedStage);
    if (!pin) return;

    const pinX = pin.x * imageSize;
    const pinY = pin.y * imageSize;
    const maxTX = ((ZOOM_HIGHLIGHT - 1) * imageSize) / 2;
    const maxTY = ((ZOOM_HIGHLIGHT - 1) * imageSize) / 2;
    const targetTX = Math.min(Math.max(screenW / 2 - pinX * ZOOM_HIGHLIGHT, -maxTX), maxTX);
    const targetTY = Math.min(Math.max(screenH / 2 - pinY * ZOOM_HIGHLIGHT, -maxTY), maxTY);

    scale.value = withSpring(ZOOM_HIGHLIGHT, { damping: 15 });
    translateX.value = withSpring(targetTX, { damping: 15 });
    translateY.value = withSpring(targetTY, { damping: 15 });
  }, [highlightedStage]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ width: imageSize, height: imageSize }, animatedStyle]}>
          <Image
            source={require("@/assets/images/festival-map.jpg")}
            style={{ width: imageSize, height: imageSize }}
            resizeMode="contain"
          />
          {STAGE_PINS.map((pin) => {
            const isHighlighted = pin.stage === highlightedStage;
            const cx = pin.x * imageSize;
            const cy = pin.y * imageSize;
            return (
              <View
                key={pin.stage}
                style={[styles.pinWrapper, { left: cx - 12, top: cy - 12 }]}
              >
                {isHighlighted && (
                  <View style={[styles.pinRing, { borderColor: colors.primary }]} />
                )}
                <View
                  style={[
                    styles.pin,
                    {
                      backgroundColor: isHighlighted ? colors.primary : "rgba(255,255,255,0.7)",
                      borderColor: isHighlighted ? colors.primary : colors.textMuted,
                    },
                  ]}
                >
                  <FontAwesome
                    name="map-marker"
                    size={10}
                    color={isHighlighted ? "#fff" : colors.textMuted}
                  />
                </View>
                {isHighlighted && (
                  <Text
                    style={[styles.pinLabel, { color: colors.primary, backgroundColor: colors.background + "E0" }]}
                    numberOfLines={1}
                  >
                    {pin.stage}
                  </Text>
                )}
              </View>
            );
          })}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  pinWrapper: {
    position: "absolute",
    alignItems: "center",
  },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pinRing: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    opacity: 0.5,
    top: -8,
    left: -8,
  },
  pinLabel: {
    marginTop: spacing.xs,
    fontSize: fontSizes.xs,
    fontWeight: "700",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});
