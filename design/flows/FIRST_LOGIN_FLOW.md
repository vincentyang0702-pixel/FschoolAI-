# First Login Flow

## Entry Point
Student arrives at `neuro-agi.vercel.app` → taps "Sign In" → Canvas OAuth → returns to app.

## Flow
1. Canvas OAuth completes
2. Backend calls `brain-person-service.ts` → creates Brain person if new
3. `needsOnboarding: true` → redirect to `/onboarding`
4. Student completes 3-step onboarding (see `00-ONBOARDING.md`)
5. Redirect to `/` (HOME page)
6. HOME page shows: "Welcome, [TutorName] is ready."

## Returning User Flow
1. Canvas OAuth completes
2. `needsOnboarding: false` → redirect directly to `/` (HOME)
3. HOME page shows: today's situation summary

## Error States
- Canvas OAuth fails → show "Couldn't connect to Canvas. Try again." with retry button
- Brain DB unavailable → show HOME with "Your brain is loading..." skeleton state
