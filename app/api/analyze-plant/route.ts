import OpenAI from "openai";
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

const maxPhotos = 5;
const maxPhotoSize = 10 * 1024 * 1024;
const optimizedImageMaxSide = 1200;
const optimizedJpegQuality = 82;
const targetOptimizedBytes = 600 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

const schema = {
  name: "plant_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      detectedSpecies: { type: ["string", "null"] },
      scientificName: { type: ["string", "null"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      condition: { type: "string", enum: ["healthy", "check_soon", "needs_attention", "unknown"] },
      statusLabel: {
        type: "object",
        additionalProperties: false,
        properties: { en: { type: "string" }, ru: { type: "string" } },
        required: ["en", "ru"]
      },
      summary: {
        type: "object",
        additionalProperties: false,
        properties: { en: { type: "string" }, ru: { type: "string" } },
        required: ["en", "ru"]
      },
      visibleObservations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { en: { type: "string" }, ru: { type: "string" } },
          required: ["en", "ru"]
        }
      },
      nextAction: { type: "string", enum: ["water", "check_soil", "take_photo", "none"] },
      nextCheckInDays: { type: ["number", "null"], minimum: 0, maximum: 30 },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["watering", "light", "location", "humidity", "repotting", "monitoring", "other"] },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            en: { type: "string" },
            ru: { type: "string" }
          },
          required: ["type", "priority", "en", "ru"]
        }
      },
      uncertainties: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { en: { type: "string" }, ru: { type: "string" } },
          required: ["en", "ru"]
        }
      }
    },
    required: [
      "detectedSpecies",
      "scientificName",
      "confidence",
      "condition",
      "statusLabel",
      "summary",
      "visibleObservations",
      "nextAction",
      "nextCheckInDays",
      "recommendations",
      "uncertainties"
    ]
  },
  strict: true
};

async function optimizeImageForAnalysis(file: File) {
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const candidates = [
    { maxSide: optimizedImageMaxSide, quality: optimizedJpegQuality },
    { maxSide: optimizedImageMaxSide, quality: 80 },
    { maxSide: 1000, quality: 80 }
  ];
  let optimizedBuffer: Buffer | null = null;

  for (const candidate of candidates) {
    optimizedBuffer = await sharp(inputBuffer, { failOn: "none" })
      .rotate()
      .resize({
        width: candidate.maxSide,
        height: candidate.maxSide,
        fit: "inside",
        withoutEnlargement: true
      })
      .flatten({ background: "#ffffff" })
      .jpeg({
        quality: candidate.quality,
        mozjpeg: true
      })
      .toBuffer();

    if (optimizedBuffer.byteLength <= targetOptimizedBytes) {
      break;
    }
  }

  return {
    dataUrl: `data:image/jpeg;base64,${optimizedBuffer!.toString("base64")}`,
    originalBytes: file.size,
    optimizedBytes: optimizedBuffer!.byteLength
  };
}

function safeError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const message = process.env.NODE_ENV === "development" ? "OPENAI_API_KEY is not configured." : "Plant analysis is unavailable.";
    return safeError(message, 503);
  }

  const formData = await request.formData();
  const files = formData.getAll("photos").filter((value): value is File => value instanceof File);
  const locale = String(formData.get("locale") ?? "en");
  const photoTypes = formData.getAll("photoTypes").map(String);

  if (!files.length) {
    return safeError("At least one image is required.");
  }

  if (files.length > maxPhotos) {
    return safeError(`Use ${maxPhotos} photos or fewer.`);
  }

  for (const file of files) {
    if (file.size > maxPhotoSize || !allowedTypes.has(file.type)) {
      return safeError("One or more images are unsupported or too large.");
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const client = new OpenAI({ apiKey });
    const optimizedImages = await Promise.all(files.map(optimizeImageForAnalysis));
    console.info("Plant analysis images optimized", {
      count: optimizedImages.length,
      originalBytes: optimizedImages.reduce((total, image) => total + image.originalBytes, 0),
      optimizedBytes: optimizedImages.reduce((total, image) => total + image.optimizedBytes, 0)
    });
    const inputContent = [
      {
        type: "input_text",
        text: [
          "You are helping with houseplant care from user-provided photos.",
          "Return only cautious, advisory plant-care analysis.",
          "Separate visible observations from cautious inferences and user actions needed to verify.",
          "Do not claim measured soil moisture, root health when roots are not visible, pests that are not clearly visible, or exact disease diagnoses without sufficient visual evidence.",
          "For watering, prefer nextAction check_soil over water unless dry soil is directly visible or user-provided context confirms dryness.",
          `User locale: ${locale}. Photo types in order: ${photoTypes.join(", ") || "unknown"}.`
        ].join("\n")
      },
      ...optimizedImages.map((image) => ({ type: "input_image", image_url: image.dataUrl }))
    ];

    const response = await client.responses.create(
      {
        model,
        input: [{ role: "user", content: inputContent as never }],
        text: {
          format: {
            type: "json_schema",
            ...schema
          }
        }
      } as never,
      { signal: controller.signal }
    );

    const text = response.output_text;
    const analysis = JSON.parse(text);

    return NextResponse.json({
      ok: true,
      analysis,
      model: response.model ?? model
    });
  } catch (error) {
    console.error("Plant analysis failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return safeError("Plant analysis failed.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
