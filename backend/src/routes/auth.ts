import { Router } from "express";
import { prisma } from "../lib/prismaClient";
import { loginSchema } from "../lib/validation";
import { createSessionToken, SESSION_COOKIE } from "../lib/session";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 24 * 7,
};

authRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: users });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ success: false, error: "No seeded user with that email" });
      return;
    }
    const token = createSessionToken(user.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions);
    res.json({ success: true, data: { id: user.id, name: user.name, email: user.email } });
  })
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ success: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});
