# Testing

Use these commands from the repository root unless noted.

## Standard Gate

```bash
cd mac-server
npm test
npm run build
npm run simulate
```

Run this gate before committing source, UI, provider, session, or docs changes.

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

Bare `?` must return intent options:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","courseHint":"CS 132 parsing","nearbyContext":"FIRST and FOLLOW sets"}'
```

Selected intent must return a tutor answer:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"regionText":"FOLLOW(A) includes FIRST(B)","marker":"?","selectedIntent":"Explain when FOLLOW includes FIRST","courseHint":"CS 132 parsing","nearbyContext":"FIRST and FOLLOW sets"}'
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
