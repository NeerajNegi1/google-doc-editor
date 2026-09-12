import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prismaClient";
import { SESSION_COOKIE, verifySessionToken } from "../lib/session";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; email: string };
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const userId = verifySessionToken(token);
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) req.user = { id: user.id, name: user.name, email: user.email };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Sign in required" });
    return;
  }
  next();
}
