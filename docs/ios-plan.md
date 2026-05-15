# iOS Companion Plan

## Goal

Keep the current Mac web companion as the primary MVP and add native iOS only after the Mac server, web UI, session state, manual frame upload, and `codex_private_local` provider are stable.

## Recommended First Native Shape

Start with a small iPhone/iPad companion app that talks to the Mac server over LAN:

- The Mac server remains the tutor backend.
- The native app shows connection status, pairing, current detected question, intent options, tutor answer, and history.
- The native app calls the existing HTTP endpoints first: `/pairing`, `/health`, `/providers`, `/simulate-detection`, `/select-intent`, `/session`, `/latest`, `/clear-session`, and `/frame`.
- Goodnotes remains the main study surface.

## Xcode Project Approach

Use a minimal SwiftUI app when the web MVP is stable:

- One Xcode workspace under `ios/`.
- SwiftUI views for status, simulated detection, answer, and history.
- A small API client with a configurable Mac server URL.
- Pairing token stored in memory first. Keychain storage can be added later only if needed.
- No ReplayKit or PiP in the first native commit.

If Xcode project generation becomes fragile, stop at a documented `ios/README.md` and keep the web UI as the working fallback.

## LAN Pairing Model

Native app should follow the same security model as the web UI:

- Localhost mode has no pairing requirement.
- LAN mode requires `PAIRING_TOKEN` or a generated terminal token.
- Native requests send `x-pairing-token`.
- The app should not send data to public endpoints.

## Native Milestone Order

1. SwiftUI companion that mirrors the web UI.
2. Manual screenshot/crop upload using `/frame`.
3. Better session display and reconnect behavior.
4. ReplayKit research spike.
5. ReplayKit Broadcast Upload Extension prototype only after explicit approval.

## Non-Goals For First Native App

- Replacing Goodnotes.
- Building handwriting OCR.
- Running Codex on device.
- Reading Codex/OpenClaw auth files.
- Implementing PiP before the core companion loop works.
