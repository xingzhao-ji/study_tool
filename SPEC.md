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

Milestones 0-3 intentionally implement only a Mac-only mock tutor loop, provider integration boundary, and local browser companion UI. There is no capture, OCR, image processing, PiP, iOS app, or Codex shellout yet.

## Current Mac-Only Loop

The Mac server exposes:

- `GET /health`: returns service and provider status.
- `POST /ask`: accepts boxed region text, marker, optional selected intent, optional course hint, nearby context, previous tutor state, and future image path metadata.

The mock provider returns intent options for ambiguous `?` requests and concise rule-based tutor answers for explicit markers or selected intents.

## Milestone 2 Provider Boundary

Milestone 2 adds provider selection without enabling private local execution. The server can be configured with `TUTOR_PROVIDER=mock` or `TUTOR_PROVIDER=codex_private_local`.

The `codex_private_local` provider is a design placeholder only. It may build intent, tutor, and check prompts from the request, but it must not:

- Shell out to Codex or OpenClaw.
- Read `~/.codex`, `~/.openclaw`, `.env`, `auth.json`, browser profiles, system credential stores, or private notes.
- Inspect files outside the repository.
- Persist study data, screenshots, frames, OCR logs, or session logs.

The placeholder should return a clear not-implemented response until a later milestone explicitly defines and approves private local execution.

## Milestone 3 Companion UI

Milestone 3 adds a browser-based local companion UI served by the Mac server at `/`. The UI lets the user:

- Enter simulated boxed Goodnotes text.
- Select or type a marker.
- Add a course hint and nearby context.
- Submit to the local `/ask` endpoint.
- Choose an intent when the tutor returns `intent_options`.
- View the latest tutor response and a short in-memory turn list.

The UI is a prototype for the future companion surface. It must not capture the screen, read Goodnotes, run OCR, save study data, use browser storage, or invoke Codex.

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
2. Local provider integration design without using private auth files, shellout, or private filesystem inspection.
3. Companion UI prototype for intent selection and tutor turns.
4. Safe session state and privacy controls.
5. Screen capture research spike with explicit privacy review.
6. Boxed-region and marker detection prototype.
7. OCR integration prototype for handwritten region text.
8. End-to-end local loop from captured region to tutor response.
9. Polish, reliability, packaging, and explicit opt-in diagnostics.

## Privacy And Security Rules

- Do not commit secrets, auth files, screenshots, captured frames, OCR logs, session logs, or private study data.
- Do not inspect or depend on `~/.codex`, `~/.openclaw`, browser profiles, system credential stores, private notes, or other project folders unless explicitly approved.
- Store local study artifacts only in ignored paths.
- Prefer ephemeral processing for frames and OCR output.
- Make any diagnostic capture opt-in and easy to delete.

## Non-Goals

- Replacing Goodnotes.
- Building iOS, ReplayKit, OCR, image processing, PiP, iPhone companion, or Codex shellout in Milestones 0-3.
- Sending private study data to remote services by default.
- Building a full LMS or note-taking app.
