# Token Earn Animations

Every time a student earns tokens, they must feel it. The animation is the reward signal.

---

## Standard Token Earn

**Trigger:** Any token-earning action (submit assignment, complete lesson, join room, etc.)

**Animation:**
1. Floating "+X tokens" text appears at the point of action
2. Text rises upward over 1.2 seconds
3. Text fades out at the top
4. Stats bar token counter increments simultaneously (count-up animation, 0.4s)
5. Brief gold pulse on the stats bar

**Colors:** `--accent-gold` (#FFD700)  
**Font:** `--font-display`, 18px, bold  
**Easing:** ease-out with slight bounce at start

---

## Big Token Earn (100+ tokens)

**Trigger:** Submit assignment early, reach leaderboard milestone, win challenge

**Animation:**
1. Full-screen brief flash (gold, 10% opacity, 0.3s)
2. Large "+150 tokens" appears center screen
3. Particle burst (small gold dots radiate outward)
4. Stats bar counter increments with extra emphasis
5. Haptic feedback (if supported)

---

## Streak Token Bonus

**Trigger:** Day 3, 7, 14, 30 streak milestones

**Animation:**
1. Fire emoji 🔥 pulses 3x
2. "+50 Streak Bonus!" banner slides in from top
3. Streak counter in stats bar glows briefly

---

## Token Tier Unlock

**Trigger:** Student crosses a tier threshold (Basic → Scholar → Expert → Brain Owner)

**Animation:**
1. Full-screen celebration overlay
2. New tier badge animates in (scale from 0 to 1.2x to 1x)
3. Tier name displayed: "You're now a Scholar"
4. List of newly unlocked capabilities
5. [Continue] button

---

## Design Rules

- Animations must never block the student from continuing what they were doing
- Standard earn animation: max 1.5 seconds, non-blocking
- Big earn animation: max 2.5 seconds, can briefly pause interaction
- All animations respect reduced-motion preference (if enabled, show static "+X tokens" badge instead)
- Token counter in stats bar should always be visible — never hidden
