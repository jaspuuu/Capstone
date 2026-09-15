// Seed ONLY the official form-template registry (SF-001..SF-006). Does not
// touch organizations/accounts, so it is safe to run against a wiped DB.
//
//   npx tsx scripts/seed-form-templates.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { formTemplateSeedRows } from "../src/lib/forms-registry";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const row of formTemplateSeedRows()) {
    await prisma.formTemplate.upsert({
      where: { formCode: row.formCode },
      update: {
        formName: row.formName,
        templateVersion: row.templateVersion,
        effectiveDate: row.effectiveDate,
        status: row.status,
        referenceFile: row.referenceFile,
      },
      create: row,
    });
  }
  const count = await prisma.formTemplate.count();
  console.log(`Form templates seeded: ${count} ACTIVE rows (SF-001..SF-006, Rev. 109 November 2020).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());