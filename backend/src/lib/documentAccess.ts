import { prisma } from "./prismaClient";

export type AccessLevel = "OWNER" | "EDIT" | "VIEW" | null;

/**
 * Owner gets implicit full access; otherwise access comes only from an
 * explicit DocumentShare row, never inferred any other way.
 */
export async function resolveDocumentAccess(
  documentId: string,
  userId: string
): Promise<AccessLevel> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true },
  });
  if (!document) return null;
  if (document.ownerId === userId) return "OWNER";

  const share = await prisma.documentShare.findUnique({
    where: { documentId_userId: { documentId, userId } },
  });
  if (!share) return null;
  return share.permission === "EDIT" ? "EDIT" : "VIEW";
}

export function canEdit(access: AccessLevel): boolean {
  return access === "OWNER" || access === "EDIT";
}

export function canView(access: AccessLevel): boolean {
  return access !== null;
}
