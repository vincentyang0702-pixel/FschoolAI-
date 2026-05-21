# Neural Ring UI Design - Academic Frontend

**Visual representation of the brain state for FschoolAI educational platform.**

---

## Overview

The **Neural Ring** is a circular visualization that displays:
- **8 Neural Strings** (signal types) as ring segments
- **Real-time brain state** (focus, engagement, learning velocity)
- **Agent activity** (which agents are active)
- **Academic performance** metrics
- **Proactive recommendations** triggered by brain state

---

## The 8 Neural Strings (Ring Segments)

```
                    BEHAVIORAL
                        ↑
                   (Study patterns)
                        
        TEMPORAL ←                    → EMOTIONAL
      (When learning)            (Stress, motivation)
      
        SOCIAL ←                      → KNOWLEDGE
     (Peer compare)              (Mastery, concepts)
     
                   CONTEXT ↓
                (Course, time, env)
                
                   OUTCOME
              (Grades, performance)
```

Each segment:
- **Color-coded** by signal type
- **Animated** to show real-time updates
- **Interactive** to drill into details
- **Responsive** to show intensity

---

## Visual Design

### Ring Structure

```
┌─────────────────────────────────────────┐
│                                         │
│          ╭─────────────────╮            │
│         ╱                   ╲           │
│        │   NEURAL RING      │           │
│        │   Brain State      │           │
│        │   Visualization    │           │
│         ╲                   ╱           │
│          ╰─────────────────╯            │
│                                         │
│   Center: Current Focus Topic           │
│   Outer Ring: 8 Neural Strings          │
│   Pulsing: Real-time Activity           │
│                                         │
└─────────────────────────────────────────┘
```

### Color Palette (Academic Theme)

| Neural String | Color | Meaning |
|---------------|-------|---------|
| **Behavioral** | `#3B82F6` (Blue) | Study patterns, actions |
| **Emotional** | `#EC4899` (Pink) | Stress, motivation, confidence |
| **Knowledge** | `#10B981` (Green) | Mastery, concepts learned |
| **Context** | `#F59E0B` (Amber) | Course, time, location |
| **Outcome** | `#8B5CF6` (Purple) | Grades, performance |
| **Temporal** | `#06B6D4` (Cyan) | When learning happens |
| **Social** | `#F97316` (Orange) | Peer comparison, collaboration |
| **Biometric** | `#EF4444` (Red) | Heart rate, focus duration |

### Ring Intensity Scale

- **0%** - No signal (gray, faded)
- **25%** - Low activity (dim color)
- **50%** - Moderate activity (normal color)
- **75%** - High activity (bright color)
- **100%** - Peak activity (glowing, pulsing)

---

## Component Structure

### 1. Main Neural Ring Component

```tsx
<NeuralRing
  userId="user123"
  brainState={{
    currentFocus: "calculus",
    emotionalState: "focused",
    learningVelocity: 0.75,
    engagementLevel: 0.82
  }}
  signals={{
    behavioral: 0.65,
    emotional: 0.82,
    knowledge: 0.71,
    context: 0.88,
    outcome: 0.79,
    temporal: 0.65,
    social: 0.45,
    biometric: 0.91
  }}
  activeAgents={["study", "focus", "motivation"]}
  onSegmentClick={(segment) => showDetails(segment)}
/>
```

### 2. Ring Segment Component

Each segment represents one neural string:

```tsx
<RingSegment
  type="behavioral"
  intensity={0.65}
  label="Study Patterns"
  color="#3B82F6"
  isActive={true}
  onClick={() => showBehavioralDetails()}
/>
```

### 3. Center Display

Shows current focus and key metrics:

```tsx
<RingCenter>
  <FocusLabel>Calculus - Derivatives</FocusLabel>
  <MetricsRow>
    <Metric label="Focus" value={0.82} />
    <Metric label="Engagement" value={0.75} />
    <Metric label="Velocity" value={0.68} />
  </MetricsRow>
  <AgentBadges agents={["study", "focus"]} />
</RingCenter>
```

---

## Animation Patterns

### 1. Pulsing Animation (Real-time Activity)

```css
@keyframes pulse {
  0% {
    opacity: 1;
    r: 100px;
  }
  50% {
    opacity: 0.7;
    r: 105px;
  }
  100% {
    opacity: 1;
    r: 100px;
  }
}
```

Active segments pulse to show real-time signal flow.

### 2. Rotation Animation (Learning Progress)

```css
@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  360% {
    transform: rotate(360deg);
  }
}
```

Slow rotation indicates ongoing learning session.

### 3. Glow Animation (Agent Activity)

```css
@keyframes glow {
  0% {
    filter: drop-shadow(0 0 2px currentColor);
  }
  50% {
    filter: drop-shadow(0 0 8px currentColor);
  }
  100% {
    filter: drop-shadow(0 0 2px currentColor);
  }
}
```

Active agents create glowing effect on their segments.

---

## Interactive Features

### 1. Segment Hover

```tsx
onMouseEnter={() => {
  setHoveredSegment(segment);
  showTooltip({
    title: "Behavioral Signals",
    value: "65% - Study patterns detected",
    details: [
      "Focus: 82%",
      "Study time: 45 min",
      "Breaks: 3"
    ]
  });
}}
```

### 2. Segment Click

```tsx
onClick={() => {
  navigateToDetail({
    type: "behavioral",
    timeRange: "last_24h",
    metrics: [
      "app_usage",
      "study_patterns",
      "break_frequency"
    ]
  });
}}
```

### 3. Center Click

```tsx
onClick={() => {
  showBrainStateDetails({
    currentFocus: "calculus",
    emotionalState: "focused",
    learningVelocity: 0.75,
    recommendations: [...]
  });
}}
```

---

## Real-Time Updates

### WebSocket Connection

```tsx
useEffect(() => {
  const ws = new WebSocket(`wss://api.fschoolai.com/brain/${userId}`);
  
  ws.onmessage = (event) => {
    const update = JSON.parse(event.data);
    
    // Update neural strings
    setSignals(prev => ({
      ...prev,
      [update.type]: update.value
    }));
    
    // Trigger animation
    animateSegment(update.type);
    
    // Update center display
    updateBrainState(update.brainState);
  };
  
  return () => ws.close();
}, [userId]);
```

---

## Academic Metrics Display

### Around the Ring

```
        Focus Level
        ↓
    ╭─────────────╮
   ╱               ╲
  │  NEURAL RING   │
  │  Brain State   │
  │  Visualization │
   ╲               ╱
    ╰─────────────╯
        ↑
    Engagement Level
    
Left side: Mastery Level
Right side: Learning Velocity
```

### Metric Indicators

- **Focus Level** (top) - Current concentration (0-100%)
- **Engagement** (bottom) - Interest in current topic (0-100%)
- **Mastery** (left) - Understanding of concepts (0-100%)
- **Velocity** (right) - Learning speed (0-100%)

---

## Agent Activity Indicators

### Agent Badges Around Ring

```
    Study Agent
        ↓
    ╭─────────────╮
   ╱   ◉ ◉ ◉      ╲     ◉ = Active agent
  │  ◉ RING ◉    │
  │ ◉           ◉ │
   ╲   ◉ ◉ ◉      ╱
    ╰─────────────╯
        ↑
    Focus Agent
```

Active agents shown as glowing badges around the ring.

---

## Responsive Design

### Desktop (1920px+)
- Ring size: 400px diameter
- Segments: Large, easy to click
- Details: Side panel
- Animations: Full effects

### Tablet (768px - 1024px)
- Ring size: 300px diameter
- Segments: Medium
- Details: Modal
- Animations: Simplified

### Mobile (< 768px)
- Ring size: 200px diameter
- Segments: Small, tap-friendly
- Details: Full screen
- Animations: Minimal

---

## Implementation Example (React + SVG)

```tsx
import React, { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

export const NeuralRing = ({ userId, onSegmentClick }) => {
  const [signals, setSignals] = useState({
    behavioral: 0.65,
    emotional: 0.82,
    knowledge: 0.71,
    context: 0.88,
    outcome: 0.79,
    temporal: 0.65,
    social: 0.45,
    biometric: 0.91
  });

  const [brainState, setBrainState] = useState({
    currentFocus: "calculus",
    emotionalState: "focused",
    learningVelocity: 0.75,
    engagementLevel: 0.82
  });

  // Real-time updates
  useWebSocket(`wss://api.fschoolai.com/brain/${userId}`, (data) => {
    setSignals(prev => ({ ...prev, [data.type]: data.value }));
    setBrainState(data.brainState);
  });

  const segmentTypes = [
    { type: 'behavioral', label: 'Behavioral', color: '#3B82F6', angle: 0 },
    { type: 'emotional', label: 'Emotional', color: '#EC4899', angle: 45 },
    { type: 'knowledge', label: 'Knowledge', color: '#10B981', angle: 90 },
    { type: 'context', label: 'Context', color: '#F59E0B', angle: 135 },
    { type: 'outcome', label: 'Outcome', color: '#8B5CF6', angle: 180 },
    { type: 'temporal', label: 'Temporal', color: '#06B6D4', angle: 225 },
    { type: 'social', label: 'Social', color: '#F97316', angle: 270 },
    { type: 'biometric', label: 'Biometric', color: '#EF4444', angle: 315 }
  ];

  return (
    <div className="neural-ring-container">
      <svg width="400" height="400" viewBox="0 0 400 400">
        {/* Background circle */}
        <circle cx="200" cy="200" r="180" fill="none" stroke="#e5e7eb" strokeWidth="1" />

        {/* Ring segments */}
        {segmentTypes.map((segment, idx) => {
          const intensity = signals[segment.type];
          const radius = 150 + (intensity * 30); // Radius varies with intensity

          return (
            <RingSegment
              key={segment.type}
              {...segment}
              intensity={intensity}
              radius={radius}
              onClick={() => onSegmentClick(segment.type)}
            />
          );
        })}

        {/* Center display */}
        <circle cx="200" cy="200" r="80" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
        <text x="200" y="190" textAnchor="middle" className="text-sm font-bold">
          {brainState.currentFocus}
        </text>
        <text x="200" y="210" textAnchor="middle" className="text-xs text-gray-600">
          Focus: {Math.round(brainState.engagementLevel * 100)}%
        </text>
      </svg>
    </div>
  );
};
```

---

## Integration with Backend

### API Endpoint

```
GET /api/brain/status?userId=user123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "brainState": {
      "currentFocus": "calculus",
      "emotionalState": "focused",
      "learningVelocity": 0.75,
      "engagementLevel": 0.82
    },
    "signals": {
      "behavioral": 0.65,
      "emotional": 0.82,
      "knowledge": 0.71,
      "context": 0.88,
      "outcome": 0.79,
      "temporal": 0.65,
      "social": 0.45,
      "biometric": 0.91
    },
    "activeAgents": ["study", "focus", "motivation"],
    "recommendations": [...]
  }
}
```

### WebSocket Stream

```
wss://api.fschoolai.com/brain/{userId}
```

**Message Format:**
```json
{
  "type": "behavioral",
  "value": 0.72,
  "timestamp": "2026-05-21T10:30:00Z",
  "brainState": {
    "currentFocus": "calculus",
    "emotionalState": "focused",
    "learningVelocity": 0.75,
    "engagementLevel": 0.82
  }
}
```

---

## Academic Use Cases

### 1. Student Dashboard
Show Neural Ring as main dashboard widget:
- Overview of current brain state
- Quick access to all signals
- Real-time agent activity
- Recommendations at a glance

### 2. Study Session View
Display during active studying:
- Focus level indicator
- Engagement tracking
- Agent assistance badges
- Break recommendations

### 3. Performance Analytics
Use as summary in analytics:
- Historical brain state trends
- Signal correlation analysis
- Agent effectiveness
- Learning patterns

### 4. Mobile App
Simplified version for mobile:
- Smaller ring (200px)
- Touch-friendly segments
- Swipe for details
- Notifications for key changes

---

## Accessibility

### Color Blindness Support
- Use patterns in addition to colors
- Provide text labels
- High contrast mode option

### Keyboard Navigation
- Tab through segments
- Enter to expand details
- Arrow keys to rotate
- Escape to close details

### Screen Reader Support
```tsx
<svg
  role="img"
  aria-label="Brain state visualization showing 8 neural signals"
  aria-describedby="ring-description"
>
  {/* segments */}
</svg>
<div id="ring-description" className="sr-only">
  Behavioral: 65%, Emotional: 82%, Knowledge: 71%, ...
</div>
```

---

## Performance Optimization

### SVG Rendering
- Use `<g>` elements for grouping
- Implement virtual scrolling for details
- Debounce real-time updates
- Use `requestAnimationFrame` for animations

### WebSocket Optimization
- Throttle updates to 60fps
- Batch multiple signal updates
- Compress data payload
- Implement reconnection logic

---

## Future Enhancements

1. **3D Neural Ring** - WebGL visualization
2. **Predictive Indicators** - Show predicted brain state
3. **Comparative View** - Compare with class average
4. **Historical Timeline** - Swipe through time
5. **AR Integration** - Show ring in AR on NeuroGlass
6. **Haptic Feedback** - Vibration on state changes
7. **Voice Commands** - "Show my focus level"
8. **Customization** - User-defined segments

---

**Neural Ring UI is the visual heart of FschoolAI's proactive brain system.**
