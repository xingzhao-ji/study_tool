# ReplayKit Plan

## Goal

Eventually capture or receive Goodnotes screen frames from iPad so boxed handwritten regions and markers can be detected. This is not part of the current MVP.

## Architecture Candidate

Use ReplayKit Broadcast Upload Extension only after the web companion and Codex provider path are usable:

1. User starts a broadcast from iPad.
2. Broadcast Upload Extension receives sample buffers.
3. Extension sends downsampled frames or cropped regions to the Mac server over the local network.
4. Mac server runs region detection and OCR in later milestones.
5. Companion UI shows detected questions and tutor responses.

## Privacy Constraints

- Do not save frames by default.
- If saving is enabled, use ignored paths and explicit `SAVE_FRAMES=true`.
- Avoid logging frame payloads.
- Avoid sending frames outside the local network.
- Show clear UI state when capture is active.

## Server Endpoints To Reuse

- `/pairing` for LAN protection.
- `/frame` for frame or crop upload.
- `/simulate-detection` for manual fallback.
- `/session` and `/latest` for companion state.

## Risks

- ReplayKit may not capture Goodnotes in every mode.
- Broadcast extensions have memory and CPU limits.
- Networking from extensions can be brittle.
- App Review and entitlement behavior can constrain UX.
- OCR quality for handwriting may become the real bottleneck.

## Fallback

Keep manual screenshot/crop upload and web/iPhone Safari companion as the fallback until ReplayKit is proven reliable.
