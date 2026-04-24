# TestFlight Readiness Checklist

Run this before each TestFlight upload to ensure alignment with Apple standards.

## Safe area
- [ ] All screens respect top safe area (content below notch/Dynamic Island) on iPhone with notch
- [ ] Bottom content and tab bar sit above home indicator
- [ ] Verified on: iPhone 15/16 (or current), iPad (iPhone app 1x and 2x)

## Layout and devices
- [ ] App runs on iPhone SE (320pt width) without overflow or broken layout
- [ ] App runs on largest iPhone (Pro Max) without clipping
- [ ] iPad compatibility: run as iPhone app on iPad simulator (1x and 2x); no crashes, all controls tappable

## VoiceOver
- [ ] Enable VoiceOver; complete onboarding (Loading → Welcome → Main Tabs)
- [ ] Capture flow: back, camera, flash, switch camera, skip, save, emotion, bookmark are announced
- [ ] Home: notes placeholder, camera FAB, entry/journal cards and long-press actions are announced
- [ ] Review: segment tabs and section content (entry/journal/album cards) are announced
- [ ] Entry/Journal/Album detail: back, menu, menu options, primary actions are announced
- [ ] No critical interactive element is missing a label or role

## Larger Text (Dynamic Type)
- [ ] Set iOS Settings → Display & Brightness → Text Size (or Accessibility → Display → Larger Text) to largest
- [ ] Relaunch app; check Home, Capture, Review, and key modals for text overflow or overlap
- [ ] Reduce size one step and confirm layout remains usable

## Reduce Motion
- [ ] Enable Settings → Accessibility → Motion → Reduce Motion
- [ ] Section transitions in Review tab are instant or minimal (no long animations)

## General
- [ ] No placeholder or broken flows; app is complete per Guideline 2.1
- [ ] Build installs and launches without crash on a physical device
- [ ] Beta app description and review notes are filled in App Store Connect for TestFlight
