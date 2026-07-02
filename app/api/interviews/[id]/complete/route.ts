import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runInterviewReport } from "@/lib/interviewGraph";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const interview = await prisma.interview.findFirst({
      where: { id, userId: user.id },
      include: { turns: { orderBy: { createdAt: "asc" } } },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found." }, { status: 404 });
    }

    const report = await runInterviewReport({
      role: interview.role,
      level: interview.level,
      focus: interview.focus,
      language: interview.language,
      turns: interview.turns,
    });

    const updated = await prisma.interview.update({
      where: { id },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
        score: report.score,
        summary: report.summary,
        strengths: report.strengths,
        improvements: report.improvements,
        nextSteps: report.nextSteps,
      },
      include: { turns: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ interview: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Could not complete interview." }, { status: 500 });
  }
}
