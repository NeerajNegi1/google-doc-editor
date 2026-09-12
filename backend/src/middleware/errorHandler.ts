import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import multer from "multer";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    res.status(400).json({ success: false, error: err.issues[0]?.message ?? "Invalid input" });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ success: false, error: "Malformed request body" });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 2MB)" : "Upload failed: " + err.message;
    res.status(400).json({ success: false, error: message });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error" });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
