import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
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

    return NextResponse.json({ interview });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Could not load interview." }, { status: 500 });
  }
}
