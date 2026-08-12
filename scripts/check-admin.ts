import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.admin.findMany({
    select: { id: true, name: true, email: true, refreshTokenHash: true, createdAt: true },
  });
  console.log("ADMINS:", JSON.stringify(admins, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2));
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
