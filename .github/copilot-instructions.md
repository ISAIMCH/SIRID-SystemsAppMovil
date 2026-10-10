# GymGo Copilot Guidance

GymGo is an Expo SDK 57 React Native app using TypeScript, Expo Router, React Native StyleSheet, Reanimated, expo-blur, and expo-haptics. Preserve the existing mobile-first architecture, navigation, API contracts, and native component choices.

For substantial UI, interaction, animation, or design-system work, inspect the relevant project-local skill before editing:

- `.github/skills/impeccable/SKILL.md` for design audits, hierarchy, spacing, typography, accessibility, consistency, and polish.
- `.github/skills/design-taste-frontend/SKILL.md` for anti-template visual direction and redesign guidance. This is the verified Taste Skill from `Leonxlnx/taste-skill`.
- `.github/skills/emil-design-eng/SKILL.md` for purposeful motion, feedback timing, easing, spring decisions, and animation review.

Adapt all guidance to Expo and React Native. Prefer existing libraries and tokens. Use Reanimated or the project's existing animation primitives when appropriate, keep animation on the UI thread where possible, respect reduced-motion needs, and keep touch targets accessible. Do not apply web-only CSS, replace real backend data with mock data, or restructure navigation without an explicit request.

Skill sources:
- Impeccable: `https://github.com/pbakaus/impeccable`
- Taste Skill: `https://github.com/Leonxlnx/taste-skill` (install name: `design-taste-frontend`)
- Emil Design Engineering: `https://github.com/emilkowalski/skills`, `skills/emil-design-eng`
