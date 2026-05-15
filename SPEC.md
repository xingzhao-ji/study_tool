# Goodnotes Companion Tutor Specification

## Product Goal

Build a private personal-use AI study companion that watches Goodnotes work on an iPad, detects boxed or circled handwritten content with a question marker, asks for clarification when needed, and tutors step-by-step using a local Mac/OpenClaw/Codex setup.

The companion should not replace Goodnotes. It should act as a layer around the user's existing study workflow.

## Key Principle

If the marker is only `?`, the tutor must not answer directly. It must first list possible intentions and ask the user to choose.

## Architecture

The long-term system has four conceptual parts:

1. Capture: a future iPad ReplayKit or screen-capture path observes the Goodnotes screen.
2. Detection: future image processing and OCR find boxed or circled regions and read nearby markers.
3. Companion UI: a future iPhone, iPad, or Mac interface asks for intent clarification and displays short tutor turns.
4. Tutor provider: a local provider builds prompts and asks the selected model or local tool for step-by-step tutoring.

The current Mac MVP implements a Mac-only tutor loop, provider integration boundary, opt-in local Codex CLI adapter, local browser companion UI, volatile session state, Markdown export, and manual frame upload. There is no automatic screen capture, OCR, image processing, PiP, or iOS app yet.

## Current Mac-Only Loop

The Mac server exposes:

- `GET /health`: returns service and provider status.
- `POST /ask`: accepts boxed region text, marker, optional selected intent, optional course hint, nearby context, previous tutor state, and future image path metadata.
- Session endpoints for simulated detections, intent selection, latest state, full session state, Markdown export, clearing, and manual frame upload.

The mock provider returns intent options for ambiguous `?` requests and concise rule-based tutor answers for explicit markers or selected intents. It includes parsing-specific behavior for FIRST/FOLLOW work and generic fallback behavior for other subjects.

## Milestone 2 Provider Boundary

Milestone 2 adds provider selection and an explicit opt-in local Codex CLI provider. The server can be configured with `TUTOR_PROVIDER=mock` or `TUTOR_PROVIDER=codex_private_local`.

The `codex_private_local` provider builds intent, tutor, and check prompts from the request and shells out only to `codex exec` through a safe adapter. It must not:

- Shell out to anything except Codex CLI through the adapter.
- Read `~/.codex`, `~/.openclaw`, `.env`, `auth.json`, browser profiles, system credential stores, or private notes.
- Inspect files outside the repository.
- Persist study data, screenshots, frames, OCR logs, or session logs.

The provider uses a configurable timeout, defaults to 45 seconds, and queues calls so only one Codex request runs at a time. Tests use a fake command runner and must not require real Codex.

## Milestone 3 Companion UI

Milestone 3 adds a browser-based local companion UI served by the Mac server at `/`. The UI lets the user:

- Enter simulated boxed Goodnotes text.
- Select or type a marker.
- Add a course hint and nearby context.
- Submit to the local `/ask` endpoint.
- Choose an intent when the tutor returns `intent_options`.
- View the latest tutor response and a short in-memory turn list.
- Copy or download the current in-memory session as Markdown notes.
- Upload a screenshot/crop manually, with OCR still requiring manually corrected text.

The UI is a prototype for the future companion surface. It must not capture the screen, read Goodnotes, run OCR, save study data, or use browser storage. It invokes Codex only when the server was explicitly started with `TUTOR_PROVIDER=codex_private_local`.

For iPhone Safari, the Mac server can bind to `HOST=0.0.0.0`. LAN mode requires a pairing token. If `PAIRING_TOKEN` is not provided, the server generates an in-memory token and prints it to the terminal. The web UI prompts for the token and stores it only in page memory.

## Session State

The Mac server stores one in-memory tutor session by default. It tracks:

- Detected questions from simulated boxed regions.
- The latest detected question and tutor response.
- Tutor turns that produced answers.
- Previous tutor state passed into follow-up checks, including `check?` and `✓?`.

Session endpoints:

- `POST /simulate-detection`: creates a detected question and asks the active provider.
- `POST /select-intent`: applies the selected intent to a detected question and asks the active provider for an answer.
- `GET /latest`: returns the latest detection and response.
- `GET /session`: returns the full in-memory session.
- `GET /session.md`: returns a Markdown note generated from the in-memory session.
- `POST /clear-session`: clears in-memory detections and turns.
- `POST /frame`: accepts a manual screenshot/crop payload and optional manual detected-question text.

The first implementation is intentionally volatile and private. It does not persist session state to disk, and Markdown export is generated on request without writing files server-side.

## Manual Frame Path

Before native ReplayKit or OCR, the server accepts a manual frame upload through `/frame`. If no manual `regionText` and `marker` are supplied, the response is `manual_text_required`. If manual text and marker are supplied, the server creates a detected question and follows the same tutor loop as `/simulate-detection`.

By default, frames are processed in memory and not saved. `SAVE_FRAMES=true` explicitly enables saving under ignored `data/frames/`.

## Future iPad ReplayKit Capture

A later milestone may add iPad screen capture through ReplayKit or a related Apple-supported capture route. That work must remain privacy-preserving and should avoid storing raw frames by default. Any persisted frames must be opt-in and clearly separated from normal runtime behavior.

## Future iPhone Or iPad Companion UI

A later companion UI may show:

- Intent choices when the marker is ambiguous.
- Short tutor replies.
- Check results for boxed work.
- Minimal history for the current study session.

The UI should keep Goodnotes as the primary workspace and avoid replacing the handwritten workflow.

## Marker Language

Supported markers:

- `?`: ambiguous confusion; ask intent options if no selected intent is provided.
- `hint?`: give a small hint only.
- `next?`: give the next step only.
- `why?`: explain why the boxed statement or step is true.
- `check?`: check whether boxed work is correct.
- `✓?`: same as `check?`.
- `err?`: find the mistake.
- `full?`: give the full solution only if necessary.
- `ex?`: give a similar example.
- `simplify?`: explain more simply.

The marker language should remain short enough to write naturally in Goodnotes.

## Intent Clarification Behavior

When the marker is exactly `?`, the tutor should infer likely intentions from the boxed content and course hint, then ask the user to choose. It should not answer directly until the user selects an intent.

Example intent options for parsing work:

- Explain when FOLLOW includes FIRST.
- Check whether my rule is correct.
- Show a concrete example.
- Give the next step only.
- Find the likely misconception.

## Tutor Style

The tutor should be concise, concrete, and step-by-step. It should avoid giving away more solution than needed unless the marker or selected intent asks for a fuller explanation. For checking work, it should identify the first concrete issue before giving a complete correction.

## Milestones 0-9

0. Repository and Mac server skeleton with health check.
1. Mac-only mock tutor simulation with marker and intent behavior.
2. Local provider integration design without using private auth files or private filesystem inspection.
3. Companion UI prototype for intent selection and tutor turns.
4. Safe session state, Markdown export, and privacy controls.
5. Manual screenshot/crop upload before ReplayKit or OCR.
6. Screen capture research spike with explicit privacy review.
7. Boxed-region and marker detection prototype.
8. OCR integration prototype for handwritten region text.
9. Polish, reliability, packaging, and explicit opt-in diagnostics.

## Privacy And Security Rules

- Do not commit secrets, auth files, screenshots, captured frames, OCR logs, session logs, or private study data.
- Do not inspect or depend on `~/.codex`, `~/.openclaw`, browser profiles, system credential stores, private notes, or other project folders unless explicitly approved.
- Store local study artifacts only in ignored paths.
- Prefer ephemeral processing for frames and OCR output.
- Make any diagnostic capture opt-in and easy to delete.

## Non-Goals

- Replacing Goodnotes.
- Building native iOS, ReplayKit, OCR, image processing, or PiP before the Mac/web MVP is stable.
- Sending private study data to remote services by default.
- Building a full LMS or note-taking app.
