// useSwipe.js — Touch + keyboard swipe hook.
// Returns { onTouchStart, onTouchEnd } to spread onto the root element.
//
// Swipe direction convention: swipe left → navigate right, swipe up → navigate down.
//
// Scroll-awareness: if the touch originates inside a scrollable element, we suppress
// navigation in the axis that element scrolls. This prevents scroll attempts in the
// flashcard list, assignment draft, chat messages, etc. from firing page transitions.
//
// Ring-drag guard: ignores gestures while document.body[data-ring-drag] is set.

import { useEffect, useRef } from "react";

const MIN_SWIPE_PX = 48;

// Walk up from `el` to document.body, returning which axes have an ancestor
// that is actually scrollable (has overflow auto/scroll AND overflowing content).
function scrollableAxes(el) {
  let canScrollV = false;
  let canScrollH = false;
  let node = el;

  while (node && node !== document.body && node !== document.documentElement) {
    const tag = node.tagName?.toLowerCase();

    // textarea and select have native scrolling that getComputedStyle may not expose
    if (tag === "textarea" || tag === "select") {
      canScrollV = true;
    }

    if (!canScrollV || !canScrollH) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      const ox = style.overflowX;

      // Trust CSS overflow intent — don't require the element to be currently
      // overflowing. An empty chat list or short assignment list should still
      // suppress navigation on that axis.
      if (!canScrollV && (oy === "auto" || oy === "scroll")) {
        canScrollV = true;
      }
      if (!canScrollH && (ox === "auto" || ox === "scroll")) {
        canScrollH = true;
      }
    }

    if (canScrollV && canScrollH) break;
    node = node.parentElement;
  }

  return { canScrollV, canScrollH };
}

export function useSwipe(onSwipe) {
  // { x, y, noV, noH }
  const startRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const map = {
        ArrowLeft:  "left",
        ArrowRight: "right",
        ArrowUp:    "up",
        ArrowDown:  "down",
      };
      if (map[e.key]) onSwipe(map[e.key]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSwipe]);

  const onTouchStart = (e) => {
    // Ring drag in progress — ignore entirely
    if (document.body.dataset.ringDrag) return;

    const { canScrollV, canScrollH } = scrollableAxes(e.target);

    startRef.current = {
      x:       e.touches[0].clientX,
      y:       e.touches[0].clientY,
      noV:     canScrollV,
      noH:     canScrollH,
      scrollY: window.scrollY, // capture page scroll position at gesture start
    };
  };

  const onTouchEnd = (e) => {
    if (!startRef.current) return;
    const { x, y, noV, noH, scrollY: startScrollY } = startRef.current;
    const dx = e.changedTouches[0].clientX - x;
    const dy = e.changedTouches[0].clientY - y;
    startRef.current = null;

    if (Math.abs(dx) < MIN_SWIPE_PX && Math.abs(dy) < MIN_SWIPE_PX) return;

    const isHorizontal = Math.abs(dx) >= Math.abs(dy);

    if (isHorizontal) {
      if (noH) return;
      onSwipe(dx < 0 ? "right" : "left");
    } else {
      if (noV) return;

      // For pages that scroll at the window level, only allow vertical page
      // navigation when the gesture started at the scroll boundary.
      const pageScrollable =
        document.documentElement.scrollHeight > window.innerHeight + 8;

      if (pageScrollable) {
        const atTop    = startScrollY <= 4;
        const atBottom =
          startScrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 8;

        if (dy < 0 && !atBottom) return; // swiping up but not at bottom yet
        if (dy > 0 && !atTop)    return; // swiping down but not at top yet
      }

      onSwipe(dy < 0 ? "down" : "up");
    }
  };

  return { onTouchStart, onTouchEnd };
}
