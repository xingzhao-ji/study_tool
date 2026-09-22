# Reviewer package validation

Checked on September 21, 2026 against the public repository snapshot `dbb2b591955c3e80baf4277206669584b89598a9` on branch `agent/m0-m1-mac-loop`. This package adds clearer documentation and changes the test command to use Node's `--import tsx` loader. It does not include the separate, newer local 0.2 application.

Environment: macOS, Node.js 26.7.0. Dependencies installed from the committed lockfile with `npm ci --ignore-scripts --no-audit --no-fund`.

| Command | Observed result |
| --- | --- |
| `npm test` | 82 tests across 18 suites passed; zero failures, skips or cancellations. |
| `npm run build` | TypeScript compilation passed. |
| `npm run simulate` | Intent selection and follow-up checking assertions passed using the mock provider. |
| `npm run smoke` | Temporary-server HTTP flow passed, including streamed uploads, retrieval, source-labelled answers, session operations and cleanup. |

An isolated Chromium walkthrough also passed eight checks: course creation, streamed upload, retrieval preview, intent selection, source-labelled answer, Markdown download, session read-back after reload and a 390 px layout without horizontal overflow. The browser made zero external requests and reported zero page errors. Desktop, mobile and answer-panel screenshots were visually inspected. This used the mock provider and synthetic `follow.txt`; it did not interact with the user's browser or private study data.

## Reproduced and fixed setup problem

The previous test script invoked the `tsx` command-line wrapper while setting `TMPDIR` under the checkout. In a long checkout path on macOS, the wrapper tried to create a Unix socket beyond the platform path limit and failed with `listen EINVAL` before running any tests.

The new command runs `node --import tsx --test` with the same test globs. It avoids that wrapper's IPC socket, retains TypeScript loading and preserves the existing temporary-directory setup. The full test suite passed from the same previously failing long path. Other app commands already use this loader style.

## What these checks establish

These results validate the checked code and synthetic workflows in this environment. They do not establish general tutor correctness, arbitrary handwriting recognition, production throughput or a signed mobile build. Real model-provider execution was not used. No personal course material or credentials were included in the reviewer package.
