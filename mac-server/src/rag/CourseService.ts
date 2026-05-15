import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { Course, CourseChunk, CourseFile, CourseIndexStatus, RetrievedChunk } from "./types.js";

export interface CreateCourseInput {
  name: string;
  description?: string;
}

export interface AddTextFileInput {
  originalName: string;
  mimeType?: string;
  text: string;
}

export interface RetrieveInput {
  query: string;
  topK?: number;
}

export interface CourseService {
  listCourses(): Promise<Course[]>;
  createCourse(input: CreateCourseInput): Promise<Course>;
  getCourse(courseId: string): Promise<Course | null>;
  deleteCourse(courseId: string): Promise<boolean>;
  listFiles(courseId: string): Promise<CourseFile[]>;
  addTextFile(courseId: string, input: AddTextFileInput): Promise<CourseFile>;
  deleteFile(courseId: string, fileId: string): Promise<boolean>;
  reindexCourse(courseId: string): Promise<CourseIndexStatus>;
  indexStatus(courseId: string): Promise<CourseIndexStatus>;
  retrieve(courseId: string, input: RetrieveInput): Promise<RetrievedChunk[]>;
}

interface StoredState {
  courses: Course[];
  files: CourseFile[];
  chunks: CourseChunk[];
}

interface LocalCourseServiceOptions {
  rootDir?: string;
}

interface ExtractedTextBlock {
  pageNumber?: number;
  sectionTitle?: string;
  text: string;
  charStart?: number;
  charEnd?: number;
}

const DEFAULT_MIME_TYPE = "text/plain";
const CHUNK_CHAR_TARGET = 3600;
const CHUNK_CHAR_OVERLAP = 600;

export class LocalCourseService implements CourseService {
  private readonly rootDir: string;
  private readonly courseFilesDir: string;
  private readonly extractedTextDir: string;
  private readonly courseIndexDir: string;
  private readonly statePath: string;
  private state: StoredState | null = null;

  constructor(options: LocalCourseServiceOptions = {}) {
    this.rootDir = options.rootDir ?? path.resolve(process.cwd(), "../data");
    this.courseFilesDir = path.join(this.rootDir, "course-files");
    this.extractedTextDir = path.join(this.rootDir, "extracted-text");
    this.courseIndexDir = path.join(this.rootDir, "course-index");
    this.statePath = path.join(this.courseIndexDir, "courses.json");
  }

  async listCourses(): Promise<Course[]> {
    const state = await this.loadState();
    return [...state.courses].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async createCourse(input: CreateCourseInput): Promise<Course> {
    const state = await this.loadState();
    const now = new Date().toISOString();
    const course: Course = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now
    };

    state.courses.push(course);
    await this.saveState();
    return course;
  }

  async getCourse(courseId: string): Promise<Course | null> {
    const state = await this.loadState();
    return state.courses.find((course) => course.id === courseId) ?? null;
  }

  async deleteCourse(courseId: string): Promise<boolean> {
    const state = await this.loadState();
    const existing = state.courses.find((course) => course.id === courseId);

    if (!existing) {
      return false;
    }

    state.courses = state.courses.filter((course) => course.id !== courseId);
    state.files = state.files.filter((file) => file.courseId !== courseId);
    state.chunks = state.chunks.filter((chunk) => chunk.courseId !== courseId);
    await rm(path.join(this.courseFilesDir, courseId), { recursive: true, force: true });
    await rm(path.join(this.extractedTextDir, courseId), { recursive: true, force: true });
    await this.saveState();
    return true;
  }

  async listFiles(courseId: string): Promise<CourseFile[]> {
    const state = await this.loadState();
    return state.files
      .filter((file) => file.courseId === courseId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async addTextFile(courseId: string, input: AddTextFileInput): Promise<CourseFile> {
    const state = await this.loadState();
    const course = state.courses.find((candidate) => candidate.id === courseId);

    if (!course) {
      throw new CourseNotFoundError(courseId);
    }

    const now = new Date().toISOString();
    const fileId = randomUUID();
    const mimeType = input.mimeType || mimeTypeForName(input.originalName);
    const bytes = Buffer.from(input.text, "utf8");
    const storedPath = path.join(this.courseFilesDir, courseId, `${fileId}-${safeFileName(input.originalName)}`);
    let file: CourseFile = {
      id: fileId,
      courseId,
      originalName: input.originalName,
      storedPath,
      mimeType,
      sizeBytes: bytes.byteLength,
      status: "uploaded",
      createdAt: now,
      updatedAt: now
    };

    await mkdir(path.dirname(storedPath), { recursive: true });
    await writeFile(storedPath, bytes);
    state.files.push(file);
    file = this.updateFile(state, file.id, { status: "extracting", updatedAt: new Date().toISOString() });

    try {
      const blocks = await extractTextBlocks(file, input.text);

      if (blocks.length === 0) {
        const status = isPdf(file) ? "needs_ocr" : "failed";
        const error = isPdf(file)
          ? "PDF text extraction is not available in this dependency-free build; OCR or a local PDF text extractor is needed."
          : "No extractable text was found in this file.";
        file = this.updateFile(state, file.id, {
          status,
          error,
          updatedAt: new Date().toISOString()
        });
      } else {
        const chunks = chunkExtractedBlocks({ courseId, file, blocks });
        state.chunks = state.chunks.filter((chunk) => chunk.fileId !== file.id);
        state.chunks.push(...chunks);
        await this.writeExtractedBlocks(courseId, file.id, blocks);
        file = this.updateFile(state, file.id, {
          status: "indexed",
          error: undefined,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      file = this.updateFile(state, file.id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString()
      });
    }

    course.updatedAt = new Date().toISOString();
    await this.saveState();
    return file;
  }

  async deleteFile(courseId: string, fileId: string): Promise<boolean> {
    const state = await this.loadState();
    const file = state.files.find((candidate) => candidate.courseId === courseId && candidate.id === fileId);

    if (!file) {
      return false;
    }

    state.files = state.files.filter((candidate) => candidate.id !== fileId);
    state.chunks = state.chunks.filter((chunk) => chunk.fileId !== fileId);

    const course = state.courses.find((candidate) => candidate.id === courseId);
    if (course) {
      course.updatedAt = new Date().toISOString();
    }

    await rm(file.storedPath, { force: true });
    await rm(path.join(this.extractedTextDir, courseId, `${fileId}.jsonl`), { force: true });
    await this.saveState();
    return true;
  }

  async reindexCourse(courseId: string): Promise<CourseIndexStatus> {
    const state = await this.loadState();
    const course = state.courses.find((candidate) => candidate.id === courseId);

    if (!course) {
      throw new CourseNotFoundError(courseId);
    }

    const files = state.files.filter((file) => file.courseId === courseId);
    state.chunks = state.chunks.filter((chunk) => chunk.courseId !== courseId);

    for (const file of files) {
      const startedAt = new Date().toISOString();
      this.updateFile(state, file.id, {
        status: "extracting",
        error: undefined,
        updatedAt: startedAt
      });

      try {
        const text = await readFile(file.storedPath, "utf8");
        const fileStat = await stat(file.storedPath);
        const refreshedFile = this.updateFile(state, file.id, {
          sizeBytes: fileStat.size,
          updatedAt: new Date().toISOString()
        });
        const blocks = await extractTextBlocks(refreshedFile, text);

        if (blocks.length === 0) {
          const status = isPdf(refreshedFile) ? "needs_ocr" : "failed";
          const error = isPdf(refreshedFile)
            ? "PDF text extraction is not available in this dependency-free build; OCR or a local PDF text extractor is needed."
            : "No extractable text was found in this file.";
          this.updateFile(state, file.id, {
            status,
            error,
            updatedAt: new Date().toISOString()
          });
        } else {
          state.chunks.push(...chunkExtractedBlocks({ courseId, file: refreshedFile, blocks }));
          await this.writeExtractedBlocks(courseId, file.id, blocks);
          this.updateFile(state, file.id, {
            status: "indexed",
            error: undefined,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        this.updateFile(state, file.id, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString()
        });
      }
    }

    course.updatedAt = new Date().toISOString();
    await this.saveState();
    return this.indexStatus(courseId);
  }

  async indexStatus(courseId: string): Promise<CourseIndexStatus> {
    const state = await this.loadState();
    const files = state.files.filter((file) => file.courseId === courseId);

    return {
      courseId,
      totalFiles: files.length,
      uploadedFiles: files.filter((file) => file.status === "uploaded").length,
      extractingFiles: files.filter((file) => file.status === "extracting").length,
      indexedFiles: files.filter((file) => file.status === "indexed").length,
      failedFiles: files.filter((file) => file.status === "failed").length,
      needsOcrFiles: files.filter((file) => file.status === "needs_ocr").length,
      chunkCount: state.chunks.filter((chunk) => chunk.courseId === courseId).length
    };
  }

  async retrieve(courseId: string, input: RetrieveInput): Promise<RetrievedChunk[]> {
    const state = await this.loadState();
    const topK = Math.max(1, Math.min(input.topK ?? 5, 20));
    const queryTerms = tokenize(input.query);

    if (queryTerms.length === 0) {
      return [];
    }

    const queryPhrase = normalizePhrase(input.query);
    const chunks = state.chunks.filter((chunk) => chunk.courseId === courseId);
    const scored = chunks
      .map((chunk) => ({
        chunk,
        score: scoreChunk(chunk, queryTerms, queryPhrase)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    return scored.map(({ chunk, score }) => ({
      chunkId: chunk.id,
      courseId: chunk.courseId,
      fileId: chunk.fileId,
      sourceLabel: chunk.sourceLabel,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
      score
    }));
  }

  private updateFile(state: StoredState, fileId: string, updates: Partial<CourseFile>): CourseFile {
    const index = state.files.findIndex((file) => file.id === fileId);

    if (index === -1) {
      throw new Error(`Course file "${fileId}" was not found.`);
    }

    const updated = { ...state.files[index], ...updates };
    state.files[index] = updated;
    return updated;
  }

  private async writeExtractedBlocks(
    courseId: string,
    fileId: string,
    blocks: ExtractedTextBlock[]
  ): Promise<void> {
    const outputPath = path.join(this.extractedTextDir, courseId, `${fileId}.jsonl`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, blocks.map((block) => JSON.stringify(block)).join("\n"));
  }

  private async loadState(): Promise<StoredState> {
    if (this.state) {
      return this.state;
    }

    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as StoredState;
      this.state = {
        courses: parsed.courses ?? [],
        files: parsed.files ?? [],
        chunks: parsed.chunks ?? []
      };
    } catch {
      this.state = { courses: [], files: [], chunks: [] };
    }

    return this.state;
  }

  private async saveState(): Promise<void> {
    if (!this.state) {
      return;
    }

    await mkdir(this.courseIndexDir, { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2));
  }
}

export class CourseNotFoundError extends Error {
  constructor(readonly courseId: string) {
    super(`Course "${courseId}" was not found.`);
  }
}

async function extractTextBlocks(file: CourseFile, text: string): Promise<ExtractedTextBlock[]> {
  if (isPdf(file)) {
    return [];
  }

  const extracted = extractTextByType(file, text).trim();

  if (!extracted) {
    return [];
  }

  return [
    {
      text: extracted,
      charStart: 0,
      charEnd: extracted.length
    }
  ];
}

function extractTextByType(file: CourseFile, text: string): string {
  const extension = path.extname(file.originalName).toLowerCase();
  const mimeType = file.mimeType.toLowerCase();

  if (mimeType.includes("json") || extension === ".json") {
    return extractJsonText(text);
  }

  if (mimeType.includes("html") || extension === ".html" || extension === ".htm") {
    return stripHtml(text);
  }

  if (
    mimeType.startsWith("text/") ||
    [".txt", ".md", ".markdown"].includes(extension)
  ) {
    return text;
  }

  return "";
}

function extractJsonText(text: string): string {
  try {
    const parsed = JSON.parse(text);
    const values: string[] = [];
    collectJsonStrings(parsed, values);
    return values.join("\n");
  } catch {
    return text;
  }
}

function collectJsonStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonStrings(item, output);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectJsonStrings(item, output);
    }
  }
}

function stripHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkExtractedBlocks(input: {
  courseId: string;
  file: CourseFile;
  blocks: ExtractedTextBlock[];
}): CourseChunk[] {
  const chunks: CourseChunk[] = [];

  for (const block of input.blocks) {
    const normalized = block.text.replace(/\s+/g, " ").trim();

    if (normalized.length < 12) {
      continue;
    }

    let start = 0;

    while (start < normalized.length) {
      const hardEnd = Math.min(start + CHUNK_CHAR_TARGET, normalized.length);
      const end = hardEnd === normalized.length ? hardEnd : nearestBreak(normalized, hardEnd);
      const text = normalized.slice(start, end).trim();

      if (text.length >= 12) {
        chunks.push({
          id: randomUUID(),
          courseId: input.courseId,
          fileId: input.file.id,
          pageNumber: block.pageNumber,
          text,
          tokenEstimate: estimateTokens(text),
          sourceLabel: sourceLabelFor(input.file, block.pageNumber),
          createdAt: new Date().toISOString()
        });
      }

      if (end >= normalized.length) {
        break;
      }

      start = Math.max(0, end - CHUNK_CHAR_OVERLAP);
    }
  }

  return chunks;
}

function nearestBreak(text: string, index: number): number {
  const searchStart = Math.max(0, index - 400);
  const window = text.slice(searchStart, index);
  const breakIndex = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf("; "));

  if (breakIndex === -1) {
    return index;
  }

  return searchStart + breakIndex + 1;
}

function scoreChunk(chunk: CourseChunk, queryTerms: string[], queryPhrase: string): number {
  const textTerms = tokenize(chunk.text);
  const text = normalizePhrase(chunk.text);
  const termCounts = new Map<string, number>();

  for (const term of textTerms) {
    termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }

  const uniqueQueryTerms = [...new Set(queryTerms)];
  let matchedTerms = 0;
  let score = 0;

  for (const term of uniqueQueryTerms) {
    const count = termCounts.get(term) ?? 0;

    if (count > 0) {
      matchedTerms += 1;
      score += 1 + Math.log(count);
    }
  }

  if (queryPhrase.length > 8 && text.includes(queryPhrase)) {
    score += 4;
  }

  const coverage = matchedTerms / uniqueQueryTerms.length;
  score += coverage * 2;
  score = score / (1 + textTerms.length / 1200);

  return Number(score.toFixed(4));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ε]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1 || term === "ε");
}

function normalizePhrase(value: string): string {
  return tokenize(value).join(" ");
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function sourceLabelFor(file: CourseFile, pageNumber: number | undefined): string {
  return pageNumber ? `${file.originalName} p.${pageNumber}` : file.originalName;
}

function isPdf(file: CourseFile): boolean {
  return file.mimeType.toLowerCase() === "application/pdf" || file.originalName.toLowerCase().endsWith(".pdf");
}

function mimeTypeForName(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();

  switch (extension) {
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".html":
    case ".htm":
      return "text/html";
    case ".pdf":
      return "application/pdf";
    default:
      return DEFAULT_MIME_TYPE;
  }
}

function safeFileName(value: string): string {
  const safe = path.basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "course-file.txt";
}
