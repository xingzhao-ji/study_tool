import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import type { TutorProvider } from "./providers/TutorProvider.js";
import { TUTOR_PROVIDER_DESCRIPTORS } from "./providers/ProviderFactory.js";
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
  regionText: z.string().min(1),
  marker: z.string().min(1),
  selectedIntent: z.string().min(1).nullable().optional(),
  courseHint: z.string().optional(),
  nearbyContext: z.string().optional(),
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
  regionText: z.string().min(1),
  marker: z.string().min(1),
  courseHint: z.string().optional(),
  nearbyContext: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

const frameSchema = z.object({
  dataUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  regionText: z.string().optional(),
  marker: z.string().optional(),
  courseHint: z.string().optional(),
  nearbyContext: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

const selectIntentSchema = z.object({
  questionId: z.string().optional(),
  selectedIntent: z.string().min(1)
});

export interface ServerOptions {
  pairing?: PairingConfig;
  frameStore?: FrameStore;
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

  app.post("/ask", async (request: Request, response: Response) => {
    const parsed = askSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: "Invalid tutor request body.",
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
        answer: "Invalid detection request body.",
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
        answer: "Invalid frame request body.",
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
        answer: "Invalid intent selection body.",
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
