export type CourseFileStatus = "uploaded" | "extracting" | "indexed" | "failed" | "needs_ocr";

export interface Course {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseFile {
  id: string;
  courseId: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  status: CourseFileStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseChunk {
  id: string;
  courseId: string;
  fileId: string;
  pageNumber?: number;
  text: string;
  tokenEstimate: number;
  sourceLabel: string;
  createdAt: string;
}

export interface RetrievedChunk {
  chunkId: string;
  courseId: string;
  fileId: string;
  sourceLabel: string;
  pageNumber?: number;
  text: string;
  score: number;
}

export interface CourseIndexStatus {
  courseId: string;
  totalFiles: number;
  uploadedFiles: number;
  extractingFiles: number;
  indexedFiles: number;
  failedFiles: number;
  needsOcrFiles: number;
  chunkCount: number;
}
