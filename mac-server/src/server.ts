import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { z, type ZodError } from "zod";
import type { TutorProvider } from "./providers/TutorProvider.js";
import { TUTOR_PROVIDER_DESCRIPTORS } from "./providers/ProviderFactory.js";
import { checkCodexStatus, type CodexStatusResult } from "./providers/CodexStatus.js";
import {
  InMemoryTutorStateStore,
  requestFromDetection,
  type DetectionInput
} from "./session/TutorStateStore.js";
import { formatSessionMarkdown } from "./session/SessionMarkdown.js";
import type { PairingConfig } from "./security/Pairing.js";
import { FrameStore } from "./frame/FrameStore.js";
import {
  CourseNotFoundError,
  LocalCourseService,
  type CourseService
} from "./rag/CourseService.js";
import type { RetrievedChunk, Course } from "./rag/types.js";
import type { TutorRequest, TutorResponse } from "./types/tutor.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");

const askSchema = z.object({
  regionText: z.string().trim().min(1),
  marker: z.string().trim().min(1),
  selectedIntent: z.string().trim().min(1).nullable().optional(),
  courseHint: z.string().trim().optional(),
  nearbyContext: z.string().trim().optional(),
  courseId: z.string().trim().min(1).optional(),
  useCourseGrounding: z.boolean().optional(),
  retrievedContext: z
    .array(
      z.object({
        chunkId: z.string(),
        courseId: z.string(),
        fileId: z.string(),
        sourceLabel: z.string(),
        pageNumber: z.number().optional(),
        text: z.string(),
        score: z.number()
      })
    )
    .optional(),
  previousTutorState: z
    .array(
      z.object({
        regionText: z.string(),
        marker: z.string(),
        selectedIntent: z.string().nullable().optional(),
        answer: z.string().optional(),
        courseId: z.string().optional(),
        useCourseGrounding: z.boolean().optional()
      })
    )
    .optional(),
  imagePath: z.string().optional()
});

const detectionSchema = z.object({
  regionText: z.string().trim().min(1),
  marker: z.string().trim().min(1),
  courseHint: z.string().trim().optional(),
  nearbyContext: z.string().trim().optional(),
  courseId: z.string().trim().min(1).optional(),
  useCourseGrounding: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional()
});

const frameSchema = z
  .object({
    dataUrl: z.string().trim().refine(isBase64DataUrl).optional(),
    imageBase64: z.string().trim().refine(isBase64Payload).optional(),
    filename: z.string().optional(),
    mimeType: z.string().optional(),
    regionText: z.string().trim().optional(),
    marker: z.string().trim().optional(),
    courseHint: z.string().trim().optional(),
    nearbyContext: z.string().trim().optional(),
    confidence: z.number().min(0).max(1).optional()
  })
  .refine((input) => Boolean(input.dataUrl || input.imageBase64), {
    path: ["frame data"],
    message: "frame data is required"
  });

function isBase64DataUrl(value: string): boolean {
  const match = value.match(/^data:[^;,]*;base64,([A-Za-z0-9+/]+={0,2})$/);
  return Boolean(match?.[1] && isBase64Payload(match[1]));
}

function isBase64Payload(value: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0;
}

const selectIntentSchema = z.object({
  questionId: z.string().trim().optional(),
  selectedIntent: z.string().trim().min(1)
});

const createCourseSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional()
});

const addCourseFileSchema = z.object({
  originalName: z.string().trim().min(1),
  mimeType: z.string().trim().optional(),
  text: z.string().optional(),
  contentBase64: z.string().trim().optional()
});

const retrieveSchema = z.object({
  query: z.string().trim().min(1),
  topK: z.number().int().min(1).max(20).optional()
});

export interface ServerOptions {
  pairing?: PairingConfig;
  frameStore?: FrameStore;
  courseService?: CourseService;
  codexStatusChecker?: () => Promise<CodexStatusResult>;
}

export function createApp(
  provider: TutorProvider,
  stateStore = new InMemoryTutorStateStore(),
  options: ServerOptions = {}
): Express {
  const app = express();
  const frameStore = options.frameStore ?? new FrameStore({ saveFrames: false });
  const courseService = options.courseService ?? new LocalCourseService();

  app.use(express.static(publicDir));
  app.use(express.json({ limit: "12mb" }));

  app.get("/pairing", (_request: Request, response: Response) => {
    response.json({
      required: options.pairing?.required ?? false
    });
  });

  app.use((request: Request, response: Response, next) => {
    const pairing = options.pairing;

    if (!pairing?.required) {
      next();
      return;
    }

    const token = request.header("x-pairing-token");

    if (token && token === pairing.token) {
      next();
      return;
    }

    response.status(401).json({
      type: "error",
      answer: "Pairing token required for LAN access.",
      provider: provider.name
    });
  });

  app.get("/health", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      service: "goodnotes-companion-tutor",
      provider: provider.name
    });
  });

  app.get("/providers", (_request: Request, response: Response) => {
    response.json({
      activeProvider: provider.name,
      providers: TUTOR_PROVIDER_DESCRIPTORS
    });
  });

  app.get("/codex/status", async (_request: Request, response: Response) => {
    try {
      const statusChecker = options.codexStatusChecker ?? checkCodexStatus;
      response.json(await statusChecker());
    } catch (error) {
      response.status(500).json({
        available: false,
        loginStatus: "unknown",
        detail: "Codex status check failed.",
        checks: [],
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.get("/courses", async (_request: Request, response: Response) => {
    response.json({
      courses: await courseService.listCourses()
    });
  });

  app.post("/courses", async (request: Request, response: Response) => {
    const parsed = createCourseSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: validationErrorAnswer("Invalid course request body", parsed.error),
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    const course = await courseService.createCourse(parsed.data);
    response.status(201).json({ course });
  });

  app.get("/courses/:courseId", async (request: Request, response: Response) => {
    const course = await courseService.getCourse(request.params.courseId);

    if (!course) {
      response.status(404).json({
        type: "error",
        answer: `Course "${request.params.courseId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    response.json({ course });
  });

  app.delete("/courses/:courseId", async (request: Request, response: Response) => {
    const deleted = await courseService.deleteCourse(request.params.courseId);

    if (!deleted) {
      response.status(404).json({
        type: "error",
        answer: `Course "${request.params.courseId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    response.json({ deleted: true });
  });

  app.get("/courses/:courseId/files", async (request: Request, response: Response) => {
    const course = await courseService.getCourse(request.params.courseId);

    if (!course) {
      response.status(404).json({
        type: "error",
        answer: `Course "${request.params.courseId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    response.json({
      files: await courseService.listFiles(request.params.courseId)
    });
  });

  app.post("/courses/:courseId/files", async (request: Request, response: Response) => {
    if (!request.is("application/json")) {
      await handleCourseFileStream(request, response);
      return;
    }

    const parsed = addCourseFileSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: validationErrorAnswer("Invalid course file request body", parsed.error),
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    const text = textFromCourseFileBody(parsed.data);

    if (text === null) {
      response.status(400).json({
        type: "error",
        answer: "Invalid course file request body: text or contentBase64 is required.",
        provider: provider.name
      });
      return;
    }

    try {
      const file = await courseService.addTextFile(request.params.courseId, {
        originalName: parsed.data.originalName,
        mimeType: parsed.data.mimeType,
        text
      });
      response.status(201).json({ file });
    } catch (error) {
      handleCourseError(error, response, provider.name);
    }
  });

  app.delete("/courses/:courseId/files/:fileId", async (request: Request, response: Response) => {
    const course = await courseService.getCourse(request.params.courseId);

    if (!course) {
      response.status(404).json({
        type: "error",
        answer: `Course "${request.params.courseId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    const deleted = await courseService.deleteFile(request.params.courseId, request.params.fileId);

    if (!deleted) {
      response.status(404).json({
        type: "error",
        answer: `Course file "${request.params.fileId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    response.json({ deleted: true });
  });

  app.get("/courses/:courseId/index-status", async (request: Request, response: Response) => {
    const course = await courseService.getCourse(request.params.courseId);

    if (!course) {
      response.status(404).json({
        type: "error",
        answer: `Course "${request.params.courseId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    response.json(await courseService.indexStatus(request.params.courseId));
  });

  app.post("/courses/:courseId/reindex", async (request: Request, response: Response) => {
    try {
      response.json(await courseService.reindexCourse(request.params.courseId));
    } catch (error) {
      handleCourseError(error, response, provider.name);
    }
  });

  app.post("/courses/:courseId/retrieve", async (request: Request, response: Response) => {
    const parsed = retrieveSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: validationErrorAnswer("Invalid retrieval request body", parsed.error),
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    const course = await courseService.getCourse(request.params.courseId);

    if (!course) {
      response.status(404).json({
        type: "error",
        answer: `Course "${request.params.courseId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    const chunks = await courseService.retrieve(request.params.courseId, parsed.data);
    response.json({ chunks });
  });

  app.post("/ask", async (request: Request, response: Response) => {
    const parsed = askSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: validationErrorAnswer("Invalid tutor request body", parsed.error),
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    try {
      const grounded = await buildGroundedTutorRequest(parsed.data, stateStore.previousTutorState());
      const tutorResponse = await provider.ask(grounded.request);
      response.json(applyGroundingMetadata(tutorResponse, grounded));
    } catch (error) {
      response.status(500).json({
        type: "error",
        answer: "Tutor provider failed while handling the request.",
        provider: provider.name,
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.post("/simulate-detection", async (request: Request, response: Response) => {
    const parsed = detectionSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: validationErrorAnswer("Invalid detection request body", parsed.error),
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    try {
      response.json(await runDetection(parsed.data as DetectionInput));
    } catch (error) {
      response.status(500).json({
        type: "error",
        answer: "Tutor provider failed while handling the simulated detection.",
        provider: provider.name,
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.post("/frame", async (request: Request, response: Response) => {
    const parsed = frameSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: validationErrorAnswer("Invalid frame request body", parsed.error),
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    try {
      const frame = await frameStore.store(parsed.data);

      if (!parsed.data.regionText || !parsed.data.marker) {
        response.json({
          type: "manual_text_required",
          message: "Frame received. OCR is not implemented yet, so manual region text and marker are required.",
          frame
        });
        return;
      }

      const detectionResult = await runDetection({
        regionText: parsed.data.regionText,
        marker: parsed.data.marker,
        courseHint: parsed.data.courseHint,
        nearbyContext: parsed.data.nearbyContext,
        courseId: undefined,
        useCourseGrounding: false,
        confidence: parsed.data.confidence ?? 0.8
      });

      response.json({
        ...detectionResult,
        frame
      });
    } catch (error) {
      response.status(500).json({
        type: "error",
        answer: "Frame upload failed.",
        provider: provider.name,
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.post("/select-intent", async (request: Request, response: Response) => {
    const parsed = selectIntentSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: validationErrorAnswer("Invalid intent selection body", parsed.error),
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    const questionId = parsed.data.questionId || stateStore.latestDetection()?.id;

    if (!questionId) {
      response.status(404).json({
        type: "error",
        answer: "No detected question is available for intent selection.",
        provider: provider.name
      });
      return;
    }

    const detectedQuestion = stateStore.applySelectedIntent(questionId, parsed.data.selectedIntent);

    if (!detectedQuestion) {
      response.status(404).json({
        type: "error",
        answer: `Detected question "${questionId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    try {
      const grounded = await buildGroundedTutorRequest(
        requestFromDetection(detectedQuestion, stateStore.previousTutorState()),
        stateStore.previousTutorState()
      );
      const tutorResponse = applyGroundingMetadata(await provider.ask(grounded.request), grounded);
      stateStore.recordResponse(detectedQuestion, tutorResponse);
      response.json({
        sessionId: stateStore.getSession().id,
        detectedQuestion,
        tutorResponse
      });
    } catch (error) {
      response.status(500).json({
        type: "error",
        answer: "Tutor provider failed while handling the selected intent.",
        provider: provider.name,
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.get("/latest", (_request: Request, response: Response) => {
    response.json({
      sessionId: stateStore.getSession().id,
      latest: stateStore.getLatest()
    });
  });

  app.get("/session", (_request: Request, response: Response) => {
    response.json(stateStore.getSession());
  });

  app.get("/session.md", (_request: Request, response: Response) => {
    response.type("text/markdown").send(formatSessionMarkdown(stateStore.getSession()));
  });

  app.post("/clear-session", (_request: Request, response: Response) => {
    response.json({
      session: stateStore.clear()
    });
  });

  app.post("/undo-last", (_request: Request, response: Response) => {
    response.json({
      session: stateStore.undoLatest()
    });
  });

  async function runDetection(input: DetectionInput) {
    const detectedQuestion = stateStore.addDetection(input);
    const previousTutorState = stateStore.previousTutorState();
    const grounded = await buildGroundedTutorRequest(
      requestFromDetection(detectedQuestion, previousTutorState),
      previousTutorState
    );
    const tutorResponse = applyGroundingMetadata(await provider.ask(grounded.request), grounded);
    stateStore.recordResponse(detectedQuestion, tutorResponse);

    return {
      sessionId: stateStore.getSession().id,
      detectedQuestion,
      tutorResponse
    };
  }

  async function buildGroundedTutorRequest(
    input: TutorRequest,
    previousTutorState: TutorRequest["previousTutorState"]
  ): Promise<{
    request: TutorRequest;
    chunks: RetrievedChunk[];
    groundingStatus: TutorResponse["groundingStatus"];
    course?: Course;
  }> {
    if (!input.useCourseGrounding) {
      return {
        request: input,
        chunks: input.retrievedContext ?? [],
        groundingStatus: "disabled"
      };
    }

    if (input.marker.trim() === "?" && !input.selectedIntent) {
      return {
        request: input,
        chunks: [],
        groundingStatus: "disabled"
      };
    }

    if (!input.courseId) {
      return {
        request: { ...input, retrievedContext: [] },
        chunks: [],
        groundingStatus: "no_relevant_context"
      };
    }

    const course = await courseService.getCourse(input.courseId);

    if (!course) {
      return {
        request: { ...input, retrievedContext: [] },
        chunks: [],
        groundingStatus: "course_not_found"
      };
    }

    const chunks = await courseService.retrieve(input.courseId, {
      query: buildRetrievalQuery(input, previousTutorState),
      topK: 5
    });

    return {
      request: {
        ...input,
        retrievedContext: chunks,
        previousTutorState
      },
      chunks,
      groundingStatus: chunks.length > 0 ? "used_course_context" : "no_relevant_context",
      course
    };
  }

  async function handleCourseFileStream(request: Request, response: Response): Promise<void> {
    const originalName = request.header("x-file-name")?.trim();

    if (!originalName) {
      response.status(400).json({
        type: "error",
        answer: "Course file stream upload requires an x-file-name header.",
        provider: provider.name
      });
      return;
    }

    try {
      const file = await courseService.addFileStream(request.params.courseId, {
        originalName,
        mimeType: contentTypeWithoutParameters(request.header("content-type")) || undefined,
        stream: request
      });
      response.status(201).json({ file });
    } catch (error) {
      handleCourseError(error, response, provider.name);
    }
  }

  return app;
}

function applyGroundingMetadata(
  response: TutorResponse,
  grounded: {
    chunks: RetrievedChunk[];
    groundingStatus: TutorResponse["groundingStatus"];
  }
): TutorResponse {
  if (response.type !== "tutor_answer") {
    return response;
  }

  if (grounded.groundingStatus === "course_not_found") {
    return {
      ...response,
      sources: [],
      grounded: false,
      groundingStatus: "course_not_found"
    };
  }

  if (response.groundingStatus && response.sources) {
    return response;
  }

  const sources = grounded.chunks.map((chunk) => ({
    fileId: chunk.fileId,
    sourceLabel: chunk.sourceLabel,
    chunkId: chunk.chunkId,
    pageNumber: chunk.pageNumber
  }));

  return {
    ...response,
    sources: response.sources ?? sources,
    grounded: response.grounded ?? grounded.groundingStatus === "used_course_context",
    groundingStatus: response.groundingStatus ?? grounded.groundingStatus
  };
}

function buildRetrievalQuery(
  input: TutorRequest,
  previousTutorState: TutorRequest["previousTutorState"]
): string {
  const previous = (previousTutorState ?? [])
    .slice(-2)
    .map((turn) => [turn.regionText, turn.selectedIntent ?? "", turn.answer ?? ""].join(" "))
    .join(" ");

  return [
    input.regionText,
    input.selectedIntent ?? "",
    input.marker,
    input.nearbyContext ?? "",
    input.courseHint ?? "",
    previous
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function textFromCourseFileBody(input: z.infer<typeof addCourseFileSchema>): string | null {
  if (input.text !== undefined) {
    return input.text;
  }

  if (input.contentBase64) {
    return Buffer.from(input.contentBase64, "base64").toString("utf8");
  }

  return null;
}

function handleCourseError(error: unknown, response: Response, providerName: string): void {
  if (error instanceof CourseNotFoundError) {
    response.status(404).json({
      type: "error",
      answer: error.message,
      provider: providerName
    });
    return;
  }

  response.status(500).json({
    type: "error",
    answer: "Course material operation failed.",
    provider: providerName,
    raw: error instanceof Error ? error.message : error
  });
}

function contentTypeWithoutParameters(value: string | undefined): string | null {
  return value?.split(";")[0]?.trim() || null;
}

function validationErrorAnswer(prefix: string, error: ZodError): string {
  const fieldErrors = Object.entries(error.flatten().fieldErrors)
    .filter(([, errors]) => (errors?.length ?? 0) > 0)
    .map(([field, errors]) => {
      const detail = (errors ?? []).join(" ").toLowerCase();

      if (detail.includes("required") || detail.includes("at least 1")) {
        return `${field} is required`;
      }

      return `${field} is invalid`;
    });

  if (fieldErrors.length === 0) {
    return `${prefix}.`;
  }

  return `${prefix}: ${fieldErrors.join("; ")}.`;
}
