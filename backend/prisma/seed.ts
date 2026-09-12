import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const paragraph = (text: string) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});

async function main() {
  await prisma.documentShare.deleteMany();
  await prisma.document.deleteMany();
  await prisma.user.deleteMany();

  const alice = await prisma.user.create({
    data: { name: "Alice Kumar", email: "alice@example.com" },
  });
  const bob = await prisma.user.create({
    data: { name: "Bob Sharma", email: "bob@example.com" },
  });
  const carol = await prisma.user.create({
    data: { name: "Carol Mehta", email: "carol@example.com" },
  });

  const welcomeDoc = await prisma.document.create({
    data: {
      title: "Welcome to Docs",
      ownerId: alice.id,
      contentJson: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Welcome" }] },
          paragraph("This is a seeded document owned by Alice. Try editing it, then refresh to confirm it saved."),
          {
            type: "bulletList",
            content: [
              { type: "listItem", content: [paragraph("Bold, italic, underline")] },
              { type: "listItem", content: [paragraph("Headings and lists")] },
            ],
          },
        ],
      },
    },
  });

  await prisma.documentShare.create({
    data: { documentId: welcomeDoc.id, userId: bob.id, permission: "EDIT" },
  });

  await prisma.document.create({
    data: {
      title: "Bob's Draft",
      ownerId: bob.id,
      contentJson: {
        type: "doc",
        content: [paragraph("An empty-ish draft owned by Bob.")],
      },
    },
  });

  console.log("Seeded users:", [alice.email, bob.email, carol.email].join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
