import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const adminEmail = "sk.nehra2005@gmail.com";

export async function GET() {
  try {
    const user = await requireUser();
    if (user.email.toLowerCase() !== adminEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        interviews: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            role: true,
            level: true,
            language: true,
            status: true,
            score: true,
            createdAt: true,
            startedAt: true,
            endedAt: true,
            _count: { select: { turns: true } },
          },
        },
      },
    });

    const allInterviews = users.flatMap((item) => item.interviews);
    const scoredInterviews = allInterviews.filter((item) => typeof item.score === "number");
    const averageScore = scoredInterviews.length
      ? Math.round(scoredInterviews.reduce((total, item) => total + (item.score || 0), 0) / scoredInterviews.length)
      : 0;

    return NextResponse.json({
      stats: {
        totalUsers: users.length,
        totalInterviews: allInterviews.length,
        completed: allInterviews.filter((item) => item.status === "COMPLETED").length,
        pending: allInterviews.filter((item) => item.status === "CREATED").length,
        live: allInterviews.filter((item) => item.status === "LIVE").length,
        averageScore,
      },
      users,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Could not load admin activity." }, { status: 500 });
  }
}
