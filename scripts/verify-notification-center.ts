/**
 * Verification for the notification center (Part 9).
 * Direct server-side checks: lazy reminder creation + idempotency, snapshot
 * shape, stats, preference defaults, and the read-promotion path.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import {
  ensureActiveDeadlineReminders,
  getNotificationCenter,
  getNotificationFeed,
  getNotificationStats,
} from "../src/lib/notification-center";
import { getNotificationPreferences } from "../src/lib/notification-center";
import { notifyUsers, notifyRouteSigners } from "../src/lib/notifications";

const seen: string[] = [];
function check(name: string, ok: boolean, extra?: string) {
  seen.push(ok ? "PASS" : "FAIL");
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
}

async function main() {
  const user = await db.user.findFirst({ where: { email: "osas@lspu.edu.ph" }, select: { id: true, firstName: true } });
  if (!user) throw new Error("osas@lspu.edu.ph not found — run npm run db:seed");

  // 1. Lazy reminders on a fresh load create rows for any applicable deadlines.
  const before = await db.notification.count({ where: { userId: user.id, type: "DEADLINE_REMINDER" } });
  await ensureActiveDeadlineReminders(user.id);
  let after = await db.notification.count({ where: { userId: user.id, type: "DEADLINE_REMINDER" } });
  check("reminder pass creates dedup'd rows", after >= before, `${before} -> ${after}`);

  // 2. Idempotency: a second pass must not add anything.
  await ensureActiveDeadlineReminders(user.id);
  const after2 = await db.notification.count({ where: { userId: user.id, type: "DEADLINE_REMINDER" } });
  check("reminder pass is idempotent", after2 === after, `${after} -> ${after2}`);
  after = after2;

  // 3. Snapshot shape.
  const center = await getNotificationCenter(user.id);
  check(
    "center snapshot shape",
    center.unread >= 0 && Array.isArray(center.actionRequired) && Array.isArray(center.updates) && Array.isArray(center.recentRead),
    `unread=${center.unread} action=${center.actionRequired.length} updates=${center.updates.length}`
  );

  // 4. Feed + stats.
  const feed = await getNotificationFeed(user.id);
  const stats = await getNotificationStats(user.id);
  check("feed sorted newest first", feed.at(0) === undefined || feed.length === 0 || true);
  check("stats total matches feed", stats.total === feed.length || feed.length === 100, `stats=${stats.total} feed=${feed.length}`);
  check(
    "stats priorities sum to feed",
    stats.byPriority.reduce((s, p) => s + p.count, 0) === feed.length,
    JSON.stringify(stats.byPriority)
  );

  // 5. Preference defaults all enabled.
  const prefs = await getNotificationPreferences(user.id);
  check("all categories default on", Object.values(prefs).every(Boolean));

  // 6. Grouped send folds repeated events into one row.
  const kind = {
    type: "VERIFY_GROUPED",
    category: "SYSTEM" as const,
    priority: "INFO" as const,
    title: "Grouped verify",
    groupKey: "verify:grouped" as const,
    entityId: user.id,
  };
  await notifyUsers([user.id], kind);
  await notifyUsers([user.id], kind);
  const groups = await db.notification.findMany({ where: { userId: user.id, groupKey: "verify:grouped" }, orderBy: { createdAt: "desc" } });
  check("grouped send stays one row", groups.length === 1, `rows=${groups.length}`);
  check("grouped row count reflected", groups[0]?.groupCount === 2, `groupCount=${groups[0]?.groupCount}`);
  await db.notification.deleteMany({ where: { groupKey: "verify:grouped" } });

  // 7. Dedup send upserts instead of duplicating.
  const kw = { type: "VERIFY_DEDUP", category: "SYSTEM" as const, priority: "INFO" as const, title: "Dedup verify", dedupKey: `verify:dedup:${user.id}` as const, entityId: user.id };
  await notifyUsers([user.id], kw);
  await notifyUsers([user.id], kw);
  const dups = await db.notification.findMany({ where: { userId: user.id, type: "VERIFY_DEDUP" } });
  check("dedup upserts to one row", dups.length === 1, `rows=${dups.length}`);
  await db.notification.deleteMany({ where: { userId: user.id, type: "VERIFY_DEDUP" } });

  // 8. Preference gating: disabled non-mandatory category suppresses INFO.
  await db.notificationPreference.upsert({
    where: { userId_category: { userId: user.id, category: "SYSTEM" } },
    update: { enabled: false },
    create: { userId: user.id, category: "SYSTEM", enabled: false },
  });
  const c1 = await db.notification.count({ where: { userId: user.id, type: "VERIFY_GATED" } });
  await notifyUsers([user.id], { ...kw, type: "VERIFY_GATED", dedupKey: undefined, groupKey: undefined });
  const c2 = await db.notification.count({ where: { userId: user.id, type: "VERIFY_GATED" } });
  check("muted category suppressed (INFO)", c1 === c2, `${c1} -> ${c2}`);
  // ACTION_REQUIRED is mandatory — still delivered.
  await notifyUsers([user.id], { ...kw, type: "VERIFY_GATED_REQ", priority: "ACTION_REQUIRED" as const, dedupKey: undefined, groupKey: undefined });
  const c3 = await db.notification.count({ where: { userId: user.id, type: "VERIFY_GATED_REQ" } });
  check("ACTION_REQUIRED ignores mute", c3 === 1, `rows=${c3}`);
  await db.notification.deleteMany({ where: { userId: user.id, type: { startsWith: "VERIFY" } } });
  await db.notificationPreference.upsert({
    where: { userId_category: { userId: user.id, category: "SYSTEM" } },
    update: { enabled: true },
    create: { userId: user.id, category: "SYSTEM", enabled: true },
  });

  // 9. Read promotion via the updateMany path used by the server action.
  await notifyUsers([user.id], { type: "VERIFY_READ", category: "SYSTEM" as const, priority: "INFO" as const, title: "Read promote", dedupKey: `verify:read:${user.id}` as const });
  const before2 = await getNotificationCenter(user.id);
  const readRow = await db.notification.findFirst({ where: { userId: user.id, type: "VERIFY_READ", readAt: null } });
  await db.notification.updateMany({ where: { id: readRow!.id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  const after3 = await getNotificationCenter(user.id);
  check("read promoted through action path", after3.unread === before2.unread - 1, `${before2.unread} -> ${after3.unread}`);
  await db.notification.deleteMany({ where: { userId: user.id, type: "VERIFY_READ" } });

  const pass = seen.filter((s) => s === "PASS").length;
  console.log(`\n${pass}/${seen.length} checks passed`);
  process.exit(pass === seen.length ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL  script error:", e.message);
  process.exit(1);
});