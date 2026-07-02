type GeminiOptions = {
  systemInstruction: string;
  prompt: string;
  jsonSchema?: Record<string, unknown>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function generateWithGemini(options: GeminiOptions) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: options.systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: options.prompt }],
          },
        ],
        generationConfig: options.jsonSchema
          ? {
              temperature: 0.35,
              responseMimeType: "application/json",
              responseJsonSchema: options.jsonSchema,
            }
          : {
              temperature: 0.65,
              maxOutputTokens: 220,
            },
      }),
      signal: AbortSignal.timeout(25_000),
    },
  );

  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini request failed.");
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}
