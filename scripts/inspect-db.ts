import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  );
  console.log("TABLES:", JSON.stringify(tables, null, 2));

  const enums = await prisma.$queryRawUnsafe<Array<{ typname: string }>>(
    `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname = 'public' ORDER BY t.typname;`
  );
  console.log("ENUMS:", JSON.stringify(enums, null, 2));

  // Row counts for known tables if they exist
  const names = tables.map((t) => t.table_name);
  for (const t of ["admins", "cars", "customers", "bookings", "payments", "_prisma_migrations"]) {
    if (names.includes(t)) {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS count FROM "${t}";`
      );
      console.log(`COUNT ${t}:`, Number(rows[0].count));
    }
  }
}

main()
  .catch((e) => {
    console.error("INSPECT ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
