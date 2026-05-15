# Testing

Use these commands from the repository root unless noted.

## Standard Gate

```bash
cd mac-server
npm test
npm run build
npm run simulate
npm run smoke
```

Run this gate before committing source, UI, provider, session, or docs changes.

`npm run smoke` starts the Express app on an ephemeral localhost port and exercises the MVP HTTP flow, including the API-first course/RAG path, without requiring a long-running dev server.

## Provider Tests

```bash
cd mac-server
npm run test:codex-provider
```

These tests use fake command runners. They cover successful intent parsing, answer output, timeouts, spawn errors, bad output, prompt constraints, and max concurrency 1. They do not call the real Codex CLI.

## Dev Server Smoke

Start the server:

```bash
cd mac-server
npm run dev
```

Then test core endpoints:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/providers
curl http://localhost:3000/
```

Course/RAG smoke:

```bash
curl -X POST http://localhost:3000/courses \
  -H "Content-Type: application/json" \
  -d '{"name":"CS 132","description":"Parsing notes"}'

curl -X POST http://localhost:3000/courses/<courseId>/files \
  -H "Content-Type: application/json" \
  -d '{"originalName":"follow.txt","mimeType":"text/plain","text":"FOLLOW(A) receives FIRST(beta) except epsilon when beta follows A."}'

curl -X POST http://localhost:3000/courses/<courseId>/files \
  -H "Content-Type: text/plain" \
  -H "x-file-name: follow-stream.txt" \
  --data-binary "FOLLOW(A) receives FIRST(beta) except epsilon."

curl http://localhost:3000/courses/<courseId>/index-status

curl -X POST http://localhost:3000/courses/<courseId>/reindex

curl -X POST http://localhost:3000/courses/<courseId>/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query":"FOLLOW(A) includes FIRST(B)","topK":5}'
```

Bare `?` must return intent options:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing","nearbyContext":"FIRST and FOLLOW sets","courseId":"<courseId>","useCourseGrounding":true}'
```

Selected intent must return a tutor answer:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","selectedIntent":"Explain when FOLLOW includes FIRST","courseHint":"CS 132 parsing","nearbyContext":"FIRST and FOLLOW sets","courseId":"<courseId>","useCourseGrounding":true}'
```

Follow-up checks should identify a concrete issue:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) = { FIRST(B), ε, $ }","marker":"check?","courseHint":"CS 132 parsing","nearbyContext":"Checking whether my FOLLOW set is correct"}'
```

`✓?` should use the same check path:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"x = 5","marker":"✓?","courseHint":"Algebra","nearbyContext":"Solve 2x + 3 = 13"}'
```

Session routes:

```bash
curl -X POST http://localhost:3000/simulate-detection \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing"}'

curl -X POST http://localhost:3000/select-intent \
  -H "Content-Type: application/json" \
  -d '{"selectedIntent":"Explain when FOLLOW includes FIRST"}'

curl http://localhost:3000/latest
curl http://localhost:3000/session
curl -X POST http://localhost:3000/clear-session
```

## LAN Smoke

```bash
cd mac-server
HOST=0.0.0.0 PORT=3000 PAIRING_TOKEN=choose-a-local-token npm run dev
ipconfig getifaddr en0
```

Open `http://<MAC_LAN_IP>:3000` on iPhone Safari and enter the token. A bad token should show a rejected-token error in the UI.

## Manual Frame Smoke

Without manual text, `/frame` should require manual input:

```bash
curl -X POST http://localhost:3000/frame \
  -H "Content-Type: application/json" \
  -d '{"dataUrl":"data:text/plain;base64,aGVsbG8="}'
```

With manual text and marker, it should create a detection:

```bash
curl -X POST http://localhost:3000/frame \
  -H "Content-Type: application/json" \
  -d '{"dataUrl":"data:text/plain;base64,aGVsbG8=","regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing"}'
```

Do not enable `SAVE_FRAMES=true` unless you intentionally want local ignored files under `data/frames/`.
