import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { interviewCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    const interviews = await prisma.interview.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { turns: true } } },
    });

    return NextResponse.json({ interviews });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Could not load interviews." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = interviewCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Please choose a valid interview setup." }, { status: 400 });
    }

    const interview = await prisma.interview.create({
      data: {
        userId: user.id,
        role: parsed.data.role,
        level: parsed.data.level,
        language: parsed.data.language,
        focus: parsed.data.focus,
      },
    });

    return NextResponse.json({ interview });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Could not create interview." }, { status: 500 });
  }
}
