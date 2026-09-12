import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prismaClient";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { markdownToTiptap, plainTextToTiptap } from "../lib/markdownToTiptap";

export const uploadRouter = Router();
uploadRouter.use(requireAuth);

const SUPPORTED_EXTENSIONS = ["txt", "md"] as const;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

uploadRouter.post(
  "/import",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file was uploaded");

    const ext = extensionOf(req.file.originalname);
    if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
      throw new HttpError(400, "Unsupported file type. Only .txt and .md files are supported.");
    }

    const text = req.file.buffer.toString("utf-8");
    const contentJson = ext === "md" ? markdownToTiptap(text) : plainTextToTiptap(text);

    const titleField = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const title = titleField || req.file.originalname.replace(/\.[^.]+$/, "") || "Imported document";

    const doc = await prisma.document.create({
      data: { title, ownerId: req.user!.id, contentJson: contentJson as object },
    });

    res.status(201).json({ success: true, data: doc });
  })
);
