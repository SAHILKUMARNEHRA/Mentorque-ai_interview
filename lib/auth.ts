import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const cookieName = "mentorque_token";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function setAuthCookie(user: SessionUser) {
  const token = await createToken(user);
  const store = await cookies();

  store.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(cookieName);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.id || !payload.email || !payload.name) return null;
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getSessionUser();
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return user;
}
