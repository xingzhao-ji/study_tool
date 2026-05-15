# Goodnotes Companion Tutor

Goodnotes Companion Tutor is a private personal-use AI study companion for tutoring around handwritten Goodnotes work. The current build is Mac-only and provides a browser companion UI, mock tutor loop, and provider integration boundary without screen capture, OCR, image processing, iOS, ReplayKit, PiP, or Codex shellout.

## Current Milestone

This repository currently implements Milestones 0, 1, 2, and 3:

- A TypeScript Mac server skeleton.
- `GET /health` for service checks.
- `POST /ask` for a mock tutor loop.
- A local simulation script that exercises ambiguous intent selection and tutor answering.
- A provider-selection boundary for `mock` and `codex_private_local`.
- `GET /providers` for provider status and capability discovery.
- A local browser companion UI for entering boxed text, selecting markers, choosing intent options, and viewing tutor turns.

The Codex private local provider is intentionally not implemented yet. It only returns generated prompt metadata and a privacy-safe not-implemented response.

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

The mock provider is used by default. You can select the placeholder Codex provider with:

```bash
cd mac-server
TUTOR_PROVIDER=codex_private_local npm run dev
```

This does not run Codex, read Codex auth, inspect local config, or access private files.

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
      "status": "not_implemented"
    }
  ]
}
```

## Companion UI

The browser UI is served by the Mac server and uses the same local endpoints:

- `GET /health`
- `GET /providers`
- `POST /ask`

It keeps tutor turns only in memory for the current page session. It does not use browser storage, save screenshots, capture frames, run OCR, or read Goodnotes.

## Example Tutor Request

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing"}'
```

When the marker is exactly `?` and no `selectedIntent` is provided, the mock tutor returns intent options instead of answering directly.

## Safety And Privacy Notes

- This milestone does not read Goodnotes, capture the screen, process images, run OCR, or shell out to Codex.
- The Milestone 3 UI stores tutor turns only in browser memory for the current open page.
- The Milestone 2 provider boundary does not read `~/.codex`, `~/.openclaw`, environment auth files, browser profiles, or system credential stores.
- Do not commit secrets, authentication files, screenshots, captured frames, OCR logs, local study data, or private session logs.
- `.env`, `auth.json`, `.codex`, `.openclaw`, captured frame directories, log directories, screenshots, and local study data paths are ignored by Git.
- Future providers must not inspect `~/.codex`, `~/.openclaw`, browser profiles, system credential stores, or private notes unless explicitly approved.

## Provider Status

- `mock`: implemented and used by default.
- `codex_private_local`: Milestone 2 placeholder only. It returns a clear not-implemented response with generated prompt strings and does not access Codex auth, shell out, or inspect local private configuration.
