import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { hashPassword, setAuthCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid name, email, and password." }, { status: 400 });
  }

  const { name, email, password } = parsed.data;

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
      },
      select: { id: true, email: true, name: true },
    });

    await setAuthCookie(user);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    return NextResponse.json({ error: "Could not create your account." }, { status: 500 });
  }
}
