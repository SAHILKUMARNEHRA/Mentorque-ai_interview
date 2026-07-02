import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateWithGemini } from "@/lib/gemini";
import { buildInterviewInstructions } from "@/lib/interviewPrompt";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

type RequestBody = {
  text?: string;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as RequestBody;
    const candidateText = body.text?.trim();

    const interview = await prisma.interview.findFirst({
      where: { id, userId: user.id },
      include: { turns: { orderBy: { createdAt: "asc" } } },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found." }, { status: 404 });
    }

    if (candidateText) {
      await prisma.interviewTurn.create({
        data: {
          interviewId: id,
          speaker: "candidate",
          text: candidateText.slice(0, 6000),
        },
      });
    }

    const turns = candidateText
      ? [...interview.turns, { speaker: "candidate", text: candidateText }]
      : interview.turns;
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

    const reply = await generateWithGemini({
      systemInstruction: buildInterviewInstructions({
        role: interview.role,
        level: interview.level,
        focus: interview.focus,
        language: interview.language,
        candidateName: user.name,
      }),
      prompt: `Here is the complete interview so far:\n\n${transcript}\n\nTurn direction: ${turnDirection}\n\nGenerate only the interviewer's next short spoken response. Do not include labels, markdown, scoring, or analysis.`,
    });

    await prisma.$transaction([
      prisma.interviewTurn.create({
        data: {
          interviewId: id,
          speaker: "interviewer",
          text: reply,
        },
      }),
      prisma.interview.update({
        where: { id },
        data: {
          status: "LIVE",
          startedAt: interview.startedAt ?? new Date(),
        },
      }),
    ]);

    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate the next question." },
      { status: 500 },
    );
  }
}
