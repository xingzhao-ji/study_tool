# Local Course Material RAG

Goodnotes Companion Tutor now has a local retrieval path for course material. It is intentionally local and conservative: uploaded files stay under ignored `data/` directories, extracted text is chunked locally, and tutor requests receive only the top retrieved chunks.

## Flow

1. Create a course in the web UI or with `POST /courses`.
2. Upload text-like material in the web UI or with `POST /courses/:courseId/files`.
3. The server stores the original file under `data/course-files/`.
4. Supported text is extracted locally and written under `data/extracted-text/`.
5. Chunks and metadata are stored under `data/course-index/`.
6. `POST /courses/:courseId/retrieve` scores chunks with local lexical retrieval.
7. `/ask` retrieves chunks when `courseId` and `useCourseGrounding: true` are present.
8. Tutor responses include `sources`, `grounded`, and `groundingStatus` when an answer is produced.

The server never sends an entire textbook or uploaded course file to a tutor provider.

Delete an uploaded file with `DELETE /courses/:courseId/files/:fileId`. This removes the stored original, extracted text record, and indexed chunks for that file.

Rebuild a course index with `POST /courses/:courseId/reindex`. This rereads locally stored files and replaces the course's chunks. It is useful after extraction code changes or manual fixture edits.

## Grounding Policy

Course-grounded answers follow this priority:

1. Retrieved uploaded course material
2. The current boxed/handwritten context
3. General model knowledge only when retrieved material is insufficient

If no relevant chunks are retrieved, the mock tutor starts with:

```text
I do not see enough support for this in the uploaded course material.
```

The Codex prompt builder includes the same policy. Bare `?` remains non-negotiable: if `selectedIntent` is missing, `/ask` returns intent options and does not retrieve or answer directly.

## Data Model

- `Course`: `id`, `name`, optional `description`, `createdAt`, `updatedAt`
- `CourseFile`: `id`, `courseId`, `originalName`, `storedPath`, `mimeType`, `sizeBytes`, `status`, optional `error`, timestamps
- `Chunk`: `id`, `courseId`, `fileId`, optional `pageNumber`, `text`, `tokenEstimate`, `sourceLabel`, `createdAt`
- `RetrievedChunk`: `chunkId`, `courseId`, `fileId`, `sourceLabel`, optional `pageNumber`, `text`, `score`

File status values are `uploaded`, `extracting`, `indexed`, `failed`, and `needs_ocr`.

## Supported Inputs

The first implementation supports JSON upload bodies:

```json
{
  "originalName": "lecture.md",
  "mimeType": "text/markdown",
  "text": "course notes..."
}
```

The same endpoint also accepts non-JSON request bodies when `x-file-name` is present. This streams request bytes to local storage before indexing:

```bash
curl -X POST http://localhost:3000/courses/<courseId>/files \
  -H "Content-Type: text/plain" \
  -H "x-file-name: notes.txt" \
  --data-binary @notes.txt
```

Supported extraction:

- `.txt`
- `.md`, `.markdown`
- `.json` by collecting string values
- `.html`, `.htm` with simple tag stripping

PDF files are accepted but marked `needs_ocr` because no local PDF extractor is installed yet.

## Large File Notes

Designed for large local files, but first implementation has only been tested on small/medium fixtures.

Current limitations:

- JSON upload bodies are buffered by Express JSON parsing.
- Browser uploads and non-JSON API uploads stream request bytes to local storage first.
- Extraction rereads the local file for indexing.
- Index state is stored as JSON metadata, not sqlite.
- Retrieval is lexical/BM25-like, not embedding-based.
- Indexing is synchronous for the current request.

The next large-file step should add incremental extraction/index jobs with durable progress tracking and a stronger local metadata store before claiming gigabyte-scale support.
