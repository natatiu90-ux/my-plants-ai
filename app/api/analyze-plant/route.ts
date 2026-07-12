import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maxPhotos = 5;
const maxPhotoSize = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const model = process.env.OPENAI_PLANT_MODEL ?? "gpt-4.1-mini";

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

async function fileToDataUrl(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
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
    const imageInputs = await Promise.all(files.map(fileToDataUrl));
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
      ...imageInputs.map((imageUrl) => ({ type: "input_image", image_url: imageUrl }))
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
