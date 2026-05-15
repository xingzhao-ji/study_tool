import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

export interface FrameStoreOptions {
  saveFrames: boolean;
  rootDir?: string;
}

export interface FrameUploadInput {
  dataUrl?: string;
  imageBase64?: string;
  filename?: string;
  mimeType?: string;
}

export interface FrameRecord {
  id: string;
  receivedAt: string;
  mimeType?: string;
  saved: boolean;
  path?: string;
}

export class FrameStore {
  private readonly saveFrames: boolean;
  private readonly rootDir: string;

  constructor(options: FrameStoreOptions) {
    this.saveFrames = options.saveFrames;
    this.rootDir = options.rootDir ?? path.resolve(process.cwd(), "../data/frames");
  }

  async store(input: FrameUploadInput): Promise<FrameRecord> {
    const parsed = parseFramePayload(input);
    const record: FrameRecord = {
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      mimeType: parsed.mimeType,
      saved: false
    };

    if (!this.saveFrames || !parsed.bytes) {
      return record;
    }

    await mkdir(this.rootDir, { recursive: true });
    const extension = extensionForMimeType(parsed.mimeType);
    const filePath = path.join(this.rootDir, `${record.id}${extension}`);
    await writeFile(filePath, parsed.bytes);

    return {
      ...record,
      saved: true,
      path: filePath
    };
  }
}

function parseFramePayload(input: FrameUploadInput): { bytes?: Buffer; mimeType?: string } {
  if (input.dataUrl) {
    const match = input.dataUrl.match(/^data:([^;,]+)?;base64,(.*)$/);

    if (!match) {
      return { mimeType: input.mimeType };
    }

    return {
      mimeType: input.mimeType ?? match[1],
      bytes: Buffer.from(match[2] ?? "", "base64")
    };
  }

  if (input.imageBase64) {
    return {
      mimeType: input.mimeType,
      bytes: Buffer.from(input.imageBase64, "base64")
    };
  }

  return { mimeType: input.mimeType };
}

function extensionForMimeType(mimeType: string | undefined): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return ".bin";
  }
}
