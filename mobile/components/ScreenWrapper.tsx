import { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSwipeNav } from "../navigation/useSwipeNav";
import PageDots from "./PageDots";
import { PageKey } from "../navigation/navConfig";
import { lastDirection } from "../navigation/transitionStore";

const { width: W, height: H } = Dimensions.get("window");
const DURATION = 300;
const EASE = Easing.out(Easing.poly(4));

function getInitialOffset(dir: typeof lastDirection) {
  if (dir === "right") return { x: W,  y: 0 };
  if (dir === "left")  return { x: -W, y: 0 };
  if (dir === "down")  return { x: 0,  y: H };
  if (dir === "up")    return { x: 0,  y: -H };
  return { x: 0, y: 0 };
}

type Props = { page: PageKey; children: React.ReactNode };

export default function ScreenWrapper({ page, children }: Props) {
  const { onTouchStart, onTouchEnd } = useSwipeNav(page);
  const { x: ix, y: iy } = getInitialOffset(lastDirection);

  const translateX = useSharedValue(ix);
  const translateY = useSharedValue(iy);
  const opacity    = useSharedValue(ix !== 0 || iy !== 0 ? 0.75 : 1);

  useEffect(() => {
    translateX.value = withTiming(0, { duration: DURATION, easing: EASE });
    translateY.value = withTiming(0, { duration: DURATION, easing: EASE });
    opacity.value    = withTiming(1, { duration: DURATION, easing: EASE });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={[{ flex: 1 }, animStyle]}>
        <View
          style={styles.container}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <View style={styles.content}>{children}</View>
          <View style={styles.footer}>
            <PageDots current={page} />
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: "#0f0f0f" },
  container: { flex: 1, padding: 20 },
  content:   { flex: 1 },
  footer:    { alignItems: "center", paddingVertical: 12 },
});
