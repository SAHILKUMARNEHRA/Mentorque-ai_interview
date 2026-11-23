import mongoose from "mongoose";
import { Interview } from "../models/Interview.js";
import { generateWithGemini } from "../services/gemini.js";
import { runInterviewReport } from "../services/interviewGraph.js";
import { buildInterviewInstructions } from "../services/interviewPrompt.js";
import { HttpError } from "../utils/httpError.js";
import { interviewCreateSchema } from "../utils/validation.js";

/** Summary shape used by list views: no transcript, just a turn count. */
export function toSummary(doc) {
  const { turns = [], ...rest } = doc;
  return { ...rest, id: String(doc._id), _id: undefined, __v: undefined, user: undefined, _count: { turns: turns.length } };
}

async function findOwnedInterview(id, userId) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Interview not found.");
  const interview = await Interview.findOne({ _id: id, user: userId });
  if (!interview) throw new HttpError(404, "Interview not found.");
  return interview;
}

export async function listInterviews(req, res) {
  const interviews = await Interview.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
  res.json({ interviews: interviews.map(toSummary) });
}

export async function createInterview(req, res) {
  const parsed = interviewCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please choose a valid interview setup." });
  }
  const interview = await Interview.create({ ...parsed.data, user: req.user.id });
  res.status(201).json({ interview });
}

export async function getInterview(req, res) {
  const interview = await findOwnedInterview(req.params.id, req.user.id);
  res.json({ interview: { ...interview.toJSON(), candidateName: req.user.name } });
}

export async function respond(req, res) {
  const interview = await findOwnedInterview(req.params.id, req.user.id);
  const candidateText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const directorNote = typeof req.body?.directorNote === "string" ? req.body.directorNote.trim() : "";

  if (candidateText) {
    interview.turns.push({ speaker: "candidate", text: candidateText.slice(0, 6000) });
    await interview.save();
  }

  const turns = interview.turns;
  const transcript =
    turns.length === 0
      ? "The interview has not started yet."
      : turns.map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`).join("\n");
  const candidateAnswerCount = turns.filter((turn) => turn.speaker === "candidate").length;
  const turnDirection =
    candidateAnswerCount === 0
      ? "This is the opening turn. Ask only for the candidate's introduction, relevant experience, and practice goal. Do not ask the first interview question yet."
      : candidateAnswerCount === 1
        ? "The candidate has just given their introduction. Briefly acknowledge one specific detail from it, then ask the first interview question grounded in that exact detail."
        : "Choose the next response from the candidate's latest answer and the full context. Follow up when useful; otherwise transition naturally using something they already shared.";
  const timingDirection = directorNote ? `\nTiming/director note: ${directorNote.slice(0, 500)}` : "";

  let reply;
  try {
    reply = await generateWithGemini({
      systemInstruction: buildInterviewInstructions({
        role: interview.role,
        level: interview.level,
        focus: interview.focus,
        language: interview.language,
        candidateName: req.user.name,
      }),
      prompt: `Here is the complete interview so far:\n\n${transcript}\n\nTurn direction: ${turnDirection}${timingDirection}\n\nGenerate only the interviewer's next short spoken response. Do not include labels, markdown, scoring, or analysis.`,
    });
  } catch (error) {
    throw new HttpError(500, error instanceof Error ? error.message : "Could not generate the next question.");
  }

  interview.turns.push({ speaker: "interviewer", text: reply });
  interview.status = "LIVE";
  interview.startedAt = interview.startedAt ?? new Date();
  await interview.save();

  res.json({ reply });
}

export async function completeInterview(req, res) {
  const interview = await findOwnedInterview(req.params.id, req.user.id);

  const report = await runInterviewReport({
    role: interview.role,
    level: interview.level,
    focus: interview.focus,
    language: interview.language,
    turns: interview.turns.map((turn) => ({ speaker: turn.speaker, text: turn.text })),
  });

  Object.assign(interview, {
    status: "COMPLETED",
    endedAt: new Date(),
    score: report.score,
    summary: report.summary,
    strengths: report.strengths,
    improvements: report.improvements,
    nextSteps: report.nextSteps,
  });
  await interview.save();

  res.json({ interview });
}
