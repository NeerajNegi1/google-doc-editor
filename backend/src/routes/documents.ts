import { Router } from "express";
import { prisma } from "../lib/prismaClient";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { createDocumentSchema, shareDocumentSchema, updateDocumentSchema } from "../lib/validation";
import { canEdit, canView, resolveDocumentAccess } from "../lib/documentAccess";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const [owned, sharedRows] = await Promise.all([
      prisma.document.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, updatedAt: true, createdAt: true },
      }),
      prisma.documentShare.findMany({
        where: { userId },
        include: {
          document: {
            select: {
              id: true,
              title: true,
              updatedAt: true,
              createdAt: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
      }),
    ]);

    const shared = sharedRows.map((s) => ({
      ...s.document,
      permission: s.permission,
      ownerName: s.document.owner.name,
    }));

    res.json({ success: true, data: { owned, shared } });
  })
);

documentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { title } = createDocumentSchema.parse(req.body);
    const doc = await prisma.document.create({
      data: { title, ownerId: req.user!.id, contentJson: emptyDoc },
    });
    res.status(201).json({ success: true, data: doc });
  })
);

documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const access = await resolveDocumentAccess(req.params.id, req.user!.id);
    if (!canView(access)) throw new HttpError(403, "You do not have access to this document");

    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { owner: { select: { name: true, email: true, id: true } } },
    });
    if (!doc) throw new HttpError(404, "Document not found");

    res.json({ success: true, data: { ...doc, access } });
  })
);

documentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const access = await resolveDocumentAccess(req.params.id, req.user!.id);
    if (!canEdit(access)) throw new HttpError(403, "You do not have edit access to this document");

    const body = updateDocumentSchema.parse(req.body);
    const doc = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.contentJson !== undefined ? { contentJson: body.contentJson as object } : {}),
      },
    });
    res.json({ success: true, data: doc });
  })
);

documentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const access = await resolveDocumentAccess(req.params.id, req.user!.id);
    if (access !== "OWNER") throw new HttpError(403, "Only the owner can delete this document");

    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  })
);

documentsRouter.get(
  "/:id/shares",
  asyncHandler(async (req, res) => {
    const access = await resolveDocumentAccess(req.params.id, req.user!.id);
    if (access !== "OWNER") throw new HttpError(403, "Only the owner can view sharing settings");

    const shares = await prisma.documentShare.findMany({
      where: { documentId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json({ success: true, data: shares });
  })
);

documentsRouter.post(
  "/:id/shares",
  asyncHandler(async (req, res) => {
    const access = await resolveDocumentAccess(req.params.id, req.user!.id);
    if (access !== "OWNER") throw new HttpError(403, "Only the owner can share this document");

    const { email, permission } = shareDocumentSchema.parse(req.body);
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) throw new HttpError(404, "No user with that email");
    if (targetUser.id === req.user!.id) throw new HttpError(400, "You already own this document");

    const share = await prisma.documentShare.upsert({
      where: { documentId_userId: { documentId: req.params.id, userId: targetUser.id } },
      update: { permission },
      create: { documentId: req.params.id, userId: targetUser.id, permission },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.status(201).json({ success: true, data: share });
  })
);

documentsRouter.delete(
  "/:id/shares/:userId",
  asyncHandler(async (req, res) => {
    const access = await resolveDocumentAccess(req.params.id, req.user!.id);
    if (access !== "OWNER") throw new HttpError(403, "Only the owner can change sharing");

    await prisma.documentShare.delete({
      where: { documentId_userId: { documentId: req.params.id, userId: req.params.userId } },
    });
    res.json({ success: true });
  })
);
