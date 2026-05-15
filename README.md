# Goodnotes Companion Tutor

Goodnotes Companion Tutor is a private personal-use AI study companion for tutoring around handwritten Goodnotes work. The current build is Mac-only and provides a browser companion UI, mock tutor loop, manual frame upload path, in-memory session history, and an opt-in local Codex CLI provider without screen capture, OCR, image processing, iOS, ReplayKit, or PiP.

## Current Milestone

This repository currently implements Milestones 0, 1, 2, and 3:

- A TypeScript Mac server skeleton.
- `GET /health` for service checks.
- `POST /ask` for a mock tutor loop.
- A local simulation script that exercises ambiguous intent selection and tutor answering.
- A provider-selection boundary for `mock` and `codex_private_local`.
- `GET /providers` for provider status and capability discovery.
- A local browser companion UI for entering boxed text, selecting markers, choosing intent options, reusing prior turns, checking follow-up work, exporting Markdown notes, and viewing tutor history.
- A connection/status card for iPhone Safari and desktop browser use.
- A safe manual screenshot/crop upload path that requires manually corrected text until OCR exists.
- An opt-in `codex_private_local` provider that queues local `codex exec` calls and returns structured errors.
- A user-triggered Codex status diagnostic that runs only `which codex` and `codex login status`, with token-shaped output redacted before it reaches the UI.

## Setup

```bash
cd mac-server
npm install
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

The mock provider is used by default. You can select the opt-in local Codex provider with:

```bash
cd mac-server
TUTOR_PROVIDER=codex_private_local npm run dev
```

The Codex provider shells out only to `codex exec` through a safe adapter when `/ask` is called. It does not read auth files, inspect `~/.codex`, inspect `~/.openclaw`, or read local private config directly. The default timeout is 45 seconds:

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

Provider-specific tests use a fake command runner and do not call real Codex:

```bash
cd mac-server
npm run test:codex-provider
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

The browser UI is served by the Mac server and uses the same local endpoints:

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

It keeps tutor turns only in memory for the current page session. It can copy or download the current in-memory session as Markdown notes on request. It does not use browser storage, save screenshots by default, capture frames, run OCR, or read Goodnotes.

Daily study controls:

- A bare `?` scrolls to intent options instead of answering directly.
- `check?` and `✓?` check work and include previous tutor context when used from `Check new work` or a prior history turn.
- Answer quick actions include Hint, Next step, Why, Example, Simplify, Check new work, and Full solution.
- `Reset form` clears the draft fields without clearing history.
- `Clear session` asks for confirmation before wiping the in-memory session.
- `Undo last` removes the latest tutor turn and restores the previous answer when available.

The Connection card includes a `Check Codex` button. It performs only the allowed setup checks `which codex` and `codex login status`, then reports whether the local CLI appears ready. It does not inspect auth files.

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
- The Milestone 3 UI stores tutor turns only in browser memory for the current open page.
- Session state is currently in memory only on the Mac server. Restarting the server clears it.
- Markdown export is generated on request from in-memory session state. The server does not write session notes to disk.
- LAN mode requires a pairing token for API routes. Static UI files are served so the browser can ask for the token, but tutor/session endpoints require the token.
- Frame uploads are processed in memory by default. `SAVE_FRAMES=true` is opt-in and stores files only under ignored `data/frames/`.
- The Codex provider adapter does not read `~/.codex`, `~/.openclaw`, environment auth files, browser profiles, or system credential stores. Runtime Codex calls are explicit opt-in via `TUTOR_PROVIDER=codex_private_local`.
- Do not commit secrets, authentication files, screenshots, captured frames, OCR logs, local study data, or private session logs.
- `.env`, `auth.json`, `.codex`, `.openclaw`, captured frame directories, log directories, screenshots, and local study data paths are ignored by Git.
- Future providers must not inspect `~/.codex`, `~/.openclaw`, browser profiles, system credential stores, or private notes unless explicitly approved.

## Provider Status

- `mock`: implemented and used by default.
- `codex_private_local`: implemented as an opt-in local Codex CLI provider. It queues requests with max concurrency 1, uses `codex exec --ephemeral`, applies a configurable timeout, strips common formatting artifacts, and returns structured errors on timeout, spawn failure, non-zero exit, or bad output.
