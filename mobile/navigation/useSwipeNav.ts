import { useRef } from "react";
import { useRouter } from "expo-router";
import { NAV, PageKey } from "./navConfig";
import { setLastDirection } from "./transitionStore";

const MIN_DIST = 50;
const MIN_VEL  = 0.3; // px/ms

export function useSwipeNav(currentPage: PageKey) {
  const router = useRouter();
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  function navigate(direction: "left" | "right" | "up" | "down") {
    const target = NAV[currentPage]?.[direction];
    if (target) {
      setLastDirection(direction);
      router.replace(`/${target}`);
    }
  }

  const onTouchStart = (e: any) => {
    const touch = e.nativeEvent.touches[0];
    startRef.current = { x: touch.pageX, y: touch.pageY, t: Date.now() };
  };

  const onTouchEnd = (e: any) => {
    if (!startRef.current) return;
    const touch = e.nativeEvent.changedTouches[0];
    const dx = touch.pageX - startRef.current.x;
    const dy = touch.pageY - startRef.current.y;
    const dt = Date.now() - startRef.current.t;
    startRef.current = null;

    const horizontal = Math.abs(dx) > Math.abs(dy);
    const dist = horizontal ? Math.abs(dx) : Math.abs(dy);
    const vel  = dist / dt;

    if (dist < MIN_DIST && vel < MIN_VEL) return;

    if (horizontal) {
      navigate(dx < 0 ? "right" : "left");
    } else {
      navigate(dy < 0 ? "down" : "up");
    }
  };

  return { onTouchStart, onTouchEnd, navigate };
}
