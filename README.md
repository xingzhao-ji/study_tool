# Goodnotes Companion Tutor

Goodnotes Companion Tutor is a private personal-use AI study companion for tutoring around handwritten Goodnotes work. The current build is Mac-only and provides a browser companion UI, mock tutor loop, local course-material upload/retrieval API, manual frame upload path, in-memory session history, and an opt-in local Codex CLI provider without screen capture, OCR, image processing, iOS, ReplayKit, or PiP.

## Current Milestone

This repository currently implements the core Mac/web pieces from Milestones 0 through 5:

- A TypeScript Mac server skeleton.
- `GET /health` for service checks.
- `POST /ask` for a mock tutor loop.
- A local simulation script that exercises ambiguous intent selection and tutor answering.
- A provider-selection boundary for `mock` and `codex_private_local`.
- `GET /providers` for provider status and capability discovery.
- A local browser companion UI for entering boxed text, selecting markers, choosing intent options, creating/selecting courses, uploading course files, previewing retrieval, reusing prior turns, checking follow-up work, exporting Markdown notes, and viewing tutor history.
- A connection/status card for iPhone Safari and desktop browser use.
- A local course-material API for creating courses, uploading text-like files, chunking extracted text, lexical retrieval, and source-aware grounded tutor answers.
- A safe manual screenshot/crop upload path that requires manually corrected text until OCR exists.
- An opt-in `codex_private_local` provider that queues local `codex exec` calls and returns structured errors.
- A user-triggered Codex status diagnostic that runs only `which codex` and `codex login status`, with token-shaped output redacted before it reaches the UI.

## What Works Now

- Local Mac server at `http://localhost:3000`.
- Browser companion UI at `GET /`.
- Mock provider by default, with no external dependency.
- Bare `?` returns intent options first and does not answer directly.
- Selected intent returns a tutor answer.
- `check?` and `✓?` use the same check behavior.
- In-memory latest detection, latest answer, and turn history.
- Local course creation, text-like course file upload, local extraction, chunking, lexical retrieval, index status, UI retrieval preview, and grounded tutor responses with source labels.
- Manual screenshot/crop upload endpoint that requires manual text until OCR exists.
- LAN/iPhone Safari mode with pairing-token protection.
- Opt-in `codex_private_local` provider with fake-runner tests, timeout handling, and max concurrency 1.

## What Does Not Work Yet

- No live Goodnotes integration.
- No screen capture, ReplayKit stream, PiP companion, native iOS app, OCR, handwriting recognition, or boxed-region detection.
- No durable session persistence. Restarting the server clears session state.
- No local PDF text extraction package yet. PDF uploads are marked `needs_ocr` until OCR or a local PDF extractor is added.
- Manual frame upload does not detect text by itself.
- Real Codex CLI behavior depends on a working local `codex` install and login; tests never call real Codex.

## Setup

```bash
cd mac-server
npm install
```

## Test Commands

```bash
cd mac-server
npm test
npm run build
npm run simulate
npm run smoke
```

Provider-specific tests use a fake command runner and do not call real Codex:

```bash
cd mac-server
npm run test:codex-provider
```

## Run Server

```bash
cd mac-server
npm run dev
```

The server listens on `http://localhost:3000` by default. You can override the port with `PORT`.

Open the companion UI at:

```text
http://localhost:3000/
```

For iPhone Safari on the same Wi-Fi network, run the server in LAN mode:

```bash
cd mac-server
HOST=0.0.0.0 PORT=3000 npm run dev
```

Find your Mac LAN IP:

```bash
ipconfig getifaddr en0
```

Then open:

```text
http://<mac-lan-ip>:3000/
```

LAN mode requires a pairing token. Set one explicitly:

```bash
HOST=0.0.0.0 PORT=3000 PAIRING_TOKEN=choose-a-local-token npm run dev
```

If `PAIRING_TOKEN` is missing in LAN mode, the server generates an in-memory token and prints it in the terminal. The browser UI asks for the token and keeps it only in page memory.

## First Test Checklist

1. `cd ~/Desktop/study_tool`
2. `git pull`
3. `cd mac-server`
4. `npm install`
5. `npm test`
6. `npm run build`
7. `npm run simulate`
8. `npm run dev`
9. Open `http://localhost:3000`
10. Create a course in the Course Material panel.
11. Upload a small `.txt` or `.md` course material file.
12. Preview retrieval for a query from the course material.
13. Submit a simulated region with marker `?`.
14. Select an intent option.
15. Keep `Use uploaded course material` enabled.
16. Submit follow-up work with marker `check?`.
17. For iPhone Safari, restart with `HOST=0.0.0.0 PORT=3000 npm run dev`.
18. Run `ipconfig getifaddr en0`.
19. Open `http://<MAC_LAN_IP>:3000` on the iPhone and enter the pairing token printed by the server or set in `PAIRING_TOKEN`.

The mock provider is used by default. You can select the opt-in local Codex provider with:

```bash
cd mac-server
TUTOR_PROVIDER=codex_private_local npm run dev
```

The Codex provider shells out only to `codex exec` through a safe adapter when a tutor request is handled through `/ask`, `/simulate-detection`, or `/select-intent`. It does not read auth files, inspect `~/.codex`, inspect `~/.openclaw`, or read local private config directly. The default timeout is 45 seconds:

```bash
cd mac-server
TUTOR_PROVIDER=codex_private_local CODEX_TIMEOUT_MS=45000 npm run dev
```

Allowed status checks before using the real provider:

```bash
which codex
codex --help
codex exec --help
codex login status
```

## Run Simulation

```bash
cd mac-server
npm run simulate
```

## Example Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "ok": true,
  "service": "goodnotes-companion-tutor",
  "provider": "mock"
}
```

## Example Provider Listing

```bash
curl http://localhost:3000/providers
```

Expected provider names:

```json
{
  "activeProvider": "mock",
  "providers": [
    {
      "name": "mock",
      "status": "available"
    },
    {
      "name": "codex_private_local",
      "status": "available"
    }
  ]
}
```

Check local Codex CLI readiness without reading auth files:

```bash
curl http://localhost:3000/codex/status
```

Token-shaped status text is redacted before the response is returned to the browser.

## Companion UI

The browser UI is served by the Mac server and currently uses these local endpoints:

- `GET /health`
- `GET /providers`
- `GET /codex/status`
- `POST /ask`
- `POST /simulate-detection`
- `POST /select-intent`
- `GET /latest`
- `GET /session`
- `GET /session.md`
- `POST /clear-session`
- `POST /undo-last`
- `POST /frame`

The UI also uses these course material endpoints:

- `GET /courses`
- `POST /courses`
- `GET /courses/:courseId`
- `DELETE /courses/:courseId`
- `POST /courses/:courseId/files`
- `GET /courses/:courseId/files`
- `DELETE /courses/:courseId/files/:fileId`
- `GET /courses/:courseId/index-status`
- `POST /courses/:courseId/reindex`
- `POST /courses/:courseId/retrieve`

Tutor turns are stored only in the Mac server's in-memory session. The browser can copy or download the current in-memory session as Markdown notes on request. It does not use browser storage, save screenshots by default, capture frames, run OCR, or read Goodnotes.

Daily study controls:

- A bare `?` scrolls to intent options instead of answering directly.
- `check?` and `✓?` check work and include previous tutor context when used from `Check new work` or a prior history turn.
- Answer quick actions include Hint, Next step, Why, Example, Simplify, Check new work, and Full solution.
- `Reset form` clears the draft fields without clearing history.
- `Clear session` asks for confirmation before wiping the in-memory session.
- `Undo last` removes the latest tutor turn and restores the previous answer when available.

The Connection card includes a `Check Codex` button. It performs only the allowed setup checks `which codex` and `codex login status`, then reports whether the local CLI appears ready. It does not inspect auth files.

## Course Material And Local RAG

Course material is stored locally under ignored `data/` paths at the repository root. The server never sends entire textbooks or uploaded files to a tutor provider. It stores the upload, extracts local text when supported, chunks it, retrieves the top relevant chunks, and sends only those chunks in the tutor request.

Supported first-pass file types:

- `.txt`, `.md`, `.markdown`
- `.json` by collecting string values where possible
- `.html`, `.htm` with simple tag stripping
- `.pdf` is accepted but marked `needs_ocr` because this build has no local PDF text extractor yet

Create a course:

```bash
curl -X POST http://localhost:3000/courses \
  -H "Content-Type: application/json" \
  -d '{"name":"CS 132","description":"Parsing notes"}'
```

Upload text-like material:

```bash
curl -X POST http://localhost:3000/courses/<courseId>/files \
  -H "Content-Type: application/json" \
  -d '{"originalName":"lecture-follow.txt","mimeType":"text/plain","text":"FOLLOW(A) receives FIRST(beta) except epsilon when beta follows A."}'
```

Non-JSON uploads can stream request bytes to local storage before indexing:

```bash
curl -X POST http://localhost:3000/courses/<courseId>/files \
  -H "Content-Type: text/plain" \
  -H "x-file-name: lecture-follow.txt" \
  --data-binary @lecture-follow.txt
```

Check index status and retrieve:

```bash
curl http://localhost:3000/courses/<courseId>/index-status

curl -X POST http://localhost:3000/courses/<courseId>/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query":"FOLLOW(A) includes FIRST(B)","topK":5}'
```

Ask with course grounding:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","selectedIntent":"Explain when FOLLOW includes FIRST","courseHint":"CS 132 parsing","nearbyContext":"FIRST and FOLLOW sets","courseId":"<courseId>","useCourseGrounding":true}'
```

If the marker is exactly `?` and `selectedIntent` is missing, `/ask` still returns intent options first and does not answer directly, even with course grounding enabled.

Local storage paths:

- `data/course-files/` stores uploaded originals.
- `data/extracted-text/` stores extracted text blocks.
- `data/course-index/` stores course metadata, file metadata, and chunk metadata.
- `data/vector-store/`, `data/uploads/`, and `data/ocr/` are reserved ignored paths for later work.

Delete a course and its local course files:

```bash
curl -X DELETE http://localhost:3000/courses/<courseId>
```

To delete all local course data manually, stop the server and remove `data/course-files/`, `data/extracted-text/`, and `data/course-index/`. Do not commit anything under `data/`.

Designed for large local files, but first implementation has only been tested on small/medium fixtures. JSON upload bodies and browser UI uploads are buffered. Non-JSON API uploads stream request bytes to local storage first, but text extraction still rereads the stored file for indexing.

## Session API

Simulate a detected Goodnotes region:

```bash
curl -X POST http://localhost:3000/simulate-detection \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing"}'
```

Select an intent for the latest detected question:

```bash
curl -X POST http://localhost:3000/select-intent \
  -H "Content-Type: application/json" \
  -d '{"selectedIntent":"Explain when FOLLOW includes FIRST"}'
```

Inspect or clear in-memory state:

```bash
curl http://localhost:3000/latest
curl http://localhost:3000/session
curl http://localhost:3000/session.md
curl -X POST http://localhost:3000/undo-last
curl -X POST http://localhost:3000/clear-session
```

## Manual Frame Upload

Before native ReplayKit or OCR exists, the MVP supports a safe manual frame path. The web UI previews a selected screenshot/crop locally in the browser, then can upload either the frame alone or the frame with the manually corrected text fields:

```bash
curl -X POST http://localhost:3000/frame \
  -H "Content-Type: application/json" \
  -d '{"dataUrl":"data:text/plain;base64,aGVsbG8="}'
```

Without manual `regionText` and `marker`, `/frame` returns `manual_text_required`. With manual text, it creates the same detected-question flow as `/simulate-detection`:

```bash
curl -X POST http://localhost:3000/frame \
  -H "Content-Type: application/json" \
  -d '{"dataUrl":"data:text/plain;base64,aGVsbG8=","regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing"}'
```

Uploaded frames are not saved by default. To save them under ignored `data/frames/`:

```bash
SAVE_FRAMES=true npm run dev
```

## Example Tutor Request

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing"}'
```

When the marker is exactly `?` and no `selectedIntent` is provided, the mock tutor returns intent options instead of answering directly.

## Safety And Privacy Notes

- This milestone does not read Goodnotes, capture the screen, process images, run OCR, or invoke Codex unless `TUTOR_PROVIDER=codex_private_local` is explicitly selected.
- Session state is currently in memory only on the Mac server. Restarting the server clears it.
- Uploaded course material and extracted/indexed text are local files under ignored `data/` directories.
- Markdown export is generated on request from in-memory session state. The server does not write session notes to disk.
- LAN mode requires a pairing token for API routes. Static UI files are served so the browser can ask for the token, but tutor/session endpoints require the token.
- Frame uploads are processed in memory by default. `SAVE_FRAMES=true` is opt-in and stores files only under ignored `data/frames/`.
- The Codex provider adapter does not read `~/.codex`, `~/.openclaw`, environment auth files, browser profiles, or system credential stores. Runtime Codex calls are explicit opt-in via `TUTOR_PROVIDER=codex_private_local`.
- Do not commit secrets, authentication files, screenshots, captured frames, OCR logs, uploaded course files, extracted course text, local indexes, local study data, or private session logs.
- `.env`, `auth.json`, `.codex`, `.openclaw`, `data/`, sqlite files, captured frame directories, log directories, screenshots, and local study data paths are ignored by Git.
- Future providers must not inspect `~/.codex`, `~/.openclaw`, browser profiles, system credential stores, or private notes unless explicitly approved.

## Provider Status

- `mock`: implemented and used by default.
- `codex_private_local`: implemented as an opt-in local Codex CLI provider. It queues requests with max concurrency 1, uses `codex exec --ephemeral`, applies a configurable timeout, strips common formatting artifacts, and returns structured errors on timeout, spawn failure, non-zero exit, or bad output.

## Troubleshooting

- If `npm run dev` says the port is already in use, set another port: `PORT=3001 npm run dev`.
- If iPhone Safari cannot connect, confirm the Mac and iPhone are on the same Wi-Fi network, the server was started with `HOST=0.0.0.0`, and the URL uses the LAN IP from `ipconfig getifaddr en0`.
- If LAN requests fail with pairing errors, enter the exact `PAIRING_TOKEN` value or the generated token printed in the server terminal. A bad token is shown in the UI as rejected.
- If `codex_private_local` returns an error, run `curl http://localhost:3000/codex/status` and keep using the `mock` provider until the local CLI and login status are ready.
- If `/ask` returns `400`, make sure the JSON body includes non-empty `regionText` and `marker`.
- If `/courses/:courseId/files` marks a PDF as `needs_ocr`, use a text/Markdown export for now or add a local PDF extractor in a future change.
- If `/frame` returns `manual_text_required`, that is expected until OCR exists. Fill the boxed text and marker manually.

## Known Limitations

- The tutor can be useful for MVP testing, but the mock provider is rule-based and intentionally limited.
- Local retrieval is lexical/BM25-like, not embeddings. It works for exact course terms and small fixtures but is not a semantic search engine yet.
- Browser course upload currently reads selected files in the browser and sends buffered JSON to the local server. Non-JSON API uploads stream to disk first, but indexing is still synchronous.
- Session state is single-process memory, not a database.
- Pairing protects LAN API routes, but this is still a personal-use local/LAN tool, not a hardened multi-user service.
- Saved frames are opt-in with `SAVE_FRAMES=true` and should not be committed.

## Next Steps

1. Add local PDF text extraction when a reliable package is available.
2. Replace buffered course upload with a streaming upload route.
3. Keep hardening the web/iPhone Safari companion loop.
4. Improve follow-up checking quality for more courses and mistake types.
5. Exercise the opt-in Codex provider on a real local setup without making it default.
6. Add OCR and vision interfaces as tested stubs before attempting real handwriting recognition.
7. Use the manual frame path as the fallback for any ReplayKit or native iOS experiments.

## More Docs

- [Architecture](docs/architecture.md)
- [Testing](docs/testing.md)
- [RAG workflow](docs/rag.md)
- [Troubleshooting](docs/troubleshooting.md)
- [iOS plan](docs/ios-plan.md)
- [ReplayKit plan](docs/replaykit-plan.md)
- [PiP risk notes](docs/pip-risk.md)
