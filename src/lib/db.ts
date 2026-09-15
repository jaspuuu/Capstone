import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // PG_SSL=1 enables TLS (no system-CA verification) for hosted providers like
  // Supabase whose certificate chains aren't in node's bundled store. Local
  // development without the flag keeps the plain connection behavior.
  const ssl =
    process.env.PG_SSL === "1" ? { ssl: { rejectUnauthorized: false } } : {};
  const adapter = new PrismaPg({ connectionString, max: 10, ...ssl });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
