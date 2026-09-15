import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
const conn = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });
async function main() {
  const routes = await prisma.signatureRoute.findMany({
    where: { entityType: "SF", formKey: "SF001" },
    include: { steps: { orderBy: { order: "asc" }, include: { signer: { select: { firstName: true, lastName: true, signatureImage: true, signatureTyped: true } } } } },
  });
  console.log("SF001 routes:", routes.length);
  for (const r of routes.slice(0, 5)) {
    console.log(`\nroute ${r.id} state=${r.state} version=${r.version} entityId=${r.entityId}`);
    for (const s of r.steps) {
      console.log(`  step${s.order} ${s.role.padEnd(14)} status=${s.status.padEnd(10)} signer=${s.signer ? `${s.signer.firstName} ${s.signer.lastName}` : "—"}` +
        ` img=${s.signer?.signatureImage ? "Y" : s.signer?.signatureTyped ? "typed" : "N"} chain=${s.chainHash ? "ok" : "none"}`);
    }
  }
  const kevin = await prisma.user.findMany({ where: { OR: [{ firstName: "Kevin" }, { lastName: "Ocampo" }] }, select: { id: true, firstName: true, lastName: true, role: true } });
  console.log("\nKevin:", kevin);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
