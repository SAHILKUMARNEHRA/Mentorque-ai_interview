import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { generateWithGemini } from "./gemini.js";

const ReportState = Annotation.Root({
  role: Annotation(),
  level: Annotation(),
  focus: Annotation(),
  language: Annotation(),
  turns: Annotation({
    reducer: (_, value) => value,
    default: () => [],
  }),
  report: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
});

const fallbackReport = {
  score: 72,
  summary:
    "The interview captured enough signal to produce an initial scorecard, but the automated evaluator was unavailable. Review the saved transcript for the final hiring judgment.",
  strengths: ["Completed a live voice interview", "Responded to adaptive follow-up questions"],
  improvements: ["Add more concrete examples", "Explain trade-offs and impact with sharper metrics"],
  nextSteps: ["Practice STAR-style stories", "Record one technical deep dive with measurable outcomes"],
};

async function generateReport(state) {
  if (!process.env.GEMINI_API_KEY || state.turns.length === 0) {
    return { report: fallbackReport };
  }

  const transcript = state.turns
    .map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`)
    .join("\n");

  try {
    const response = await generateWithGemini({
      systemInstruction:
        "You are an interview evaluator. Return strict JSON only with score, summary, strengths, improvements, and nextSteps.",
      prompt: `Evaluate this ${state.level} ${state.role} mock interview focused on ${state.focus}. The interview language mode was ${state.language}. Write the JSON values in clear English for the recruiter-facing scorecard.\n\n${transcript}`,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["score", "summary", "strengths", "improvements", "nextSteps"],
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          summary: { type: "string" },
          strengths: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          improvements: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          nextSteps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
        },
      },
    });

    return { report: JSON.parse(response) };
  } catch {
    return { report: fallbackReport };
  }
}

const reportGraph = new StateGraph(ReportState)
  .addNode("generateReport", generateReport)
  .addEdge(START, "generateReport")
  .addEdge("generateReport", END)
  .compile();

export async function runInterviewReport(input) {
  const result = await reportGraph.invoke(input);
  return result.report ?? fallbackReport;
}
