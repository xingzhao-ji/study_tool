# Goodnotes Companion Tutor

Goodnotes Companion Tutor is a private personal-use AI study companion for tutoring around handwritten Goodnotes work. The current build is Mac-only and simulates the tutor loop without screen capture, OCR, image processing, iOS, ReplayKit, PiP, or Codex shellout.

## Current Milestone

This repository currently implements Milestone 0 and Milestone 1:

- A TypeScript Mac server skeleton.
- `GET /health` for service checks.
- `POST /ask` for a mock tutor loop.
- A local simulation script that exercises ambiguous intent selection and tutor answering.

The Codex private local provider is intentionally not implemented yet.

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

## Example Tutor Request

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing"}'
```

When the marker is exactly `?` and no `selectedIntent` is provided, the mock tutor returns intent options instead of answering directly.

## Safety And Privacy Notes

- This milestone does not read Goodnotes, capture the screen, process images, run OCR, or shell out to Codex.
- Do not commit secrets, authentication files, screenshots, captured frames, OCR logs, local study data, or private session logs.
- `.env`, `auth.json`, `.codex`, `.openclaw`, captured frame directories, log directories, screenshots, and local study data paths are ignored by Git.
- Future providers must not inspect `~/.codex`, `~/.openclaw`, browser profiles, system credential stores, or private notes unless explicitly approved.

## Provider Status

- `mock`: implemented and used by default.
- `codex_private_local`: placeholder only. It returns a clear not-implemented response and does not access Codex auth or local private configuration.
