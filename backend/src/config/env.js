export const config = {
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  adminEmail: (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  isProduction: process.env.NODE_ENV === "production",
};
