import { NextResponse } from "next/server";
import { setAuthCookie, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email and password." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const sessionUser = { id: user.id, email: user.email, name: user.name };
  await setAuthCookie(sessionUser);
  return NextResponse.json({ user: sessionUser });
}
