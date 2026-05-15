# Architecture

Goodnotes Companion Tutor is currently a local Mac web app for simulating the future Goodnotes tutoring loop. Goodnotes integration, OCR, ReplayKit, PiP, and native iOS are planned work, not current runtime features.

## Runtime Shape

- `mac-server/src/index.ts` reads environment configuration, creates the provider, configures pairing, and starts the Express server.
- `mac-server/src/server.ts` owns HTTP routes, request validation, static UI serving, session updates, and frame upload routing.
- `mac-server/public/` contains the browser companion UI served at `GET /`.
- `mac-server/src/session/` stores the current in-memory tutor session and formats Markdown export.
- `mac-server/src/providers/` contains the default mock tutor and the opt-in local Codex CLI provider.
- `mac-server/src/rag/` contains the local course service, data model, extraction, chunking, and lexical retrieval.
- `mac-server/src/frame/` accepts manual frame uploads and saves bytes only when `SAVE_FRAMES=true`.
- `mac-server/src/security/` decides when pairing is required.

## Tutor Flow

1. The user enters or uploads a simulated boxed region.
2. `POST /simulate-detection` records a detected question in memory.
3. If the marker is exactly `?`, the provider returns `intent_options`.
4. The UI calls `POST /select-intent` with the selected intent.
5. The provider returns a concise `tutor_answer`.
6. Later `check?` or `✓?` requests include compact previous tutor context when available.
7. `GET /latest`, `GET /session`, and `GET /session.md` expose the current in-memory state.

The non-negotiable rule is enforced by provider behavior and tests: a bare `?` returns intent options first and does not answer directly.

## Course Material RAG

Courses are managed through API routes in `mac-server/src/server.ts` and backed by `LocalCourseService`.

Current endpoints:

- `GET /courses`
- `POST /courses`
- `GET /courses/:courseId`
- `DELETE /courses/:courseId`
- `POST /courses/:courseId/files`
- `GET /courses/:courseId/files`
- `GET /courses/:courseId/index-status`
- `POST /courses/:courseId/retrieve`

The service stores uploaded originals under ignored `data/course-files/`, extracted text under `data/extracted-text/`, and course/file/chunk metadata under `data/course-index/`. Retrieval is local lexical scoring over chunks scoped by `courseId`.

When `/ask`, `/simulate-detection`, or `/select-intent` includes `courseId` and `useCourseGrounding: true`, the server retrieves relevant chunks and adds them to `TutorRequest.retrievedContext`. `TutorResponse` can include `sources`, `grounded`, and `groundingStatus`.

The browser UI exposes course selection, course creation, multi-file upload, index status, retrieval preview, grounding toggle, and source labels. Upload currently reads selected files in the browser and sends buffered JSON to the local server.

## Providers

`mock` is the default provider. It is local, deterministic, and has no external dependency, so it is the safe path for UI and route testing.

`codex_private_local` is opt-in with `TUTOR_PROVIDER=codex_private_local`. It shells out to `codex exec` only when a tutor request is made, uses a timeout, serializes requests with max concurrency 1, and returns structured errors instead of crashing the server. Tests inject a fake command runner and never call real Codex.

## Pairing And LAN Mode

Localhost mode does not require pairing. LAN mode requires a pairing token because the iPhone reaches the Mac server over the local network.

Use:

```bash
HOST=0.0.0.0 PORT=3000 PAIRING_TOKEN=choose-a-local-token npm run dev
```

If `PAIRING_TOKEN` is missing in LAN mode, the server generates an in-memory token and prints it in the terminal. The browser sends the token as `x-pairing-token` and clears it from page memory when the server rejects it.

## Frame Path

`POST /frame` is a safe manual pathway for screenshots or crops. Without `regionText` and `marker`, it returns `manual_text_required`. With manual text, it creates the same detected-question flow as `/simulate-detection`.

Frame bytes are processed in memory by default. `SAVE_FRAMES=true` is required to save files under ignored `data/frames/`.

## Privacy Boundary

The current app does not read Goodnotes, browser profiles, credentials, auth files, private notes, OCR logs, or saved screenshots. The server should continue to treat all study content as local personal data and avoid logging frame payloads or tutor session contents.
