import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const users = await db.user.count();
  console.log("Prisma query OK — User rows on Supabase pooler:", users);
}

main()
  .catch((e) => {
    console.log("ERR:", e instanceof Error ? e.message.split("\n")[0] : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());