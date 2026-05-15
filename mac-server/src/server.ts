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

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");

const askSchema = z.object({
  regionText: z.string().trim().min(1),
  marker: z.string().trim().min(1),
  selectedIntent: z.string().trim().min(1).nullable().optional(),
  courseHint: z.string().trim().optional(),
  nearbyContext: z.string().trim().optional(),
  previousTutorState: z
    .array(
      z.object({
        regionText: z.string(),
        marker: z.string(),
        selectedIntent: z.string().nullable().optional(),
        answer: z.string().optional()
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
  confidence: z.number().min(0).max(1).optional()
});

const frameSchema = z.object({
  dataUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  regionText: z.string().trim().optional(),
  marker: z.string().trim().optional(),
  courseHint: z.string().trim().optional(),
  nearbyContext: z.string().trim().optional(),
  confidence: z.number().min(0).max(1).optional()
});

const selectIntentSchema = z.object({
  questionId: z.string().optional(),
  selectedIntent: z.string().trim().min(1)
});

export interface ServerOptions {
  pairing?: PairingConfig;
  frameStore?: FrameStore;
  codexStatusChecker?: () => Promise<CodexStatusResult>;
}

export function createApp(
  provider: TutorProvider,
  stateStore = new InMemoryTutorStateStore(),
  options: ServerOptions = {}
): Express {
  const app = express();
  const frameStore = options.frameStore ?? new FrameStore({ saveFrames: false });

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
      const tutorResponse = await provider.ask(parsed.data);
      response.json(tutorResponse);
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

    const questionId = parsed.data.questionId ?? stateStore.latestDetection()?.id;

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
      const tutorResponse = await provider.ask(
        requestFromDetection(detectedQuestion, stateStore.previousTutorState())
      );
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
    const tutorResponse = await provider.ask(
      requestFromDetection(detectedQuestion, previousTutorState)
    );
    stateStore.recordResponse(detectedQuestion, tutorResponse);

    return {
      sessionId: stateStore.getSession().id,
      detectedQuestion,
      tutorResponse
    };
  }

  return app;
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
