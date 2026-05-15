import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import type { TutorProvider } from "./providers/TutorProvider.js";
import { TUTOR_PROVIDER_DESCRIPTORS } from "./providers/ProviderFactory.js";

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

export function createApp(provider: TutorProvider): Express {
  const app = express();

  app.use(express.static(publicDir));
  app.use(express.json({ limit: "1mb" }));

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

  return app;
}
