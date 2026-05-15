# Troubleshooting

## Server Will Not Start

Run from the server directory:

```bash
cd mac-server
npm install
npm run dev
```

If port `3000` is busy, use another port:

```bash
PORT=3001 npm run dev
```

Then open `http://localhost:3001`.

## iPhone Safari Cannot Connect

Use LAN mode:

```bash
cd mac-server
HOST=0.0.0.0 PORT=3000 npm run dev
ipconfig getifaddr en0
```

Open `http://<MAC_LAN_IP>:3000` on the iPhone. The Mac and iPhone must be on the same Wi-Fi network. Some VPNs, guest networks, and firewall settings can block local device connections.

## Pairing Token Fails

LAN mode requires a pairing token. Either set one:

```bash
HOST=0.0.0.0 PORT=3000 PAIRING_TOKEN=choose-a-local-token npm run dev
```

Or copy the generated token printed by the server. If the token is rejected, the UI clears it from page memory and shows a rejected-token error. Re-enter the exact current token.

## Bare `?` Answered Directly

This should not happen. Re-run:

```bash
cd mac-server
npm test
npm run simulate
```

The expected response type for a bare `?` is `intent_options`. A direct answer for a bare `?` is a product bug.

## `/ask` Returns 400

Make sure the JSON body has non-empty `regionText` and `marker`:

```json
{
  "regionText": "FOLLOW(A) includes FIRST(B)",
  "marker": "?"
}
```

## Codex Provider Fails

Keep using the default mock provider unless you are intentionally testing local Codex:

```bash
TUTOR_PROVIDER=codex_private_local npm run dev
```

Check status:

```bash
curl http://localhost:3000/codex/status
```

The status check runs only `which codex` and `codex login status`. Provider tests use fake runners and do not call real Codex.

## Frame Upload Needs Text

`manual_text_required` is expected when `/frame` receives an image without `regionText` and `marker`. OCR is not implemented yet. Enter the boxed text and marker manually, then upload with current text or use `POST /simulate-detection`.

## Course Retrieval Returns No Chunks

Check that the course has indexed files:

```bash
curl http://localhost:3000/courses/<courseId>/index-status
```

If `indexedFiles` is `0`, inspect the file list:

```bash
curl http://localhost:3000/courses/<courseId>/files
```

PDF files currently become `needs_ocr`; use a `.txt` or `.md` export for the MVP. Retrieval is lexical, so use exact course terms from the notes when testing.

## Grounded Answer Says There Is Not Enough Support

This is expected when no relevant chunks are retrieved. Confirm the `/ask` payload includes both `courseId` and `useCourseGrounding: true`, then test the same query with `POST /courses/<courseId>/retrieve`.

Bare `?` still returns intent options first. Add `selectedIntent` before expecting a grounded answer.

## Session Disappeared

Session state is in memory only. Restarting the server clears detections, turns, latest answer, and Markdown export state.

## Notes Export Fails

Use `GET /session.md` directly:

```bash
curl http://localhost:3000/session.md
```

If browser copy is unavailable on iPhone Safari, use the UI's download action or the curl endpoint.
