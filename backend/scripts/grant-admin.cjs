require('dotenv/config');
require('reflect-metadata');
const { Database } = require('../dist/database.js');
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run admin:grant -- you@example.com');
  const db = new Database();
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) throw new Error('Register this account first');
    const role = await db.role.findUniqueOrThrow({ where: { key: 'administrator' } });
    await db.$transaction(async tx => {
      await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
      await tx.auditLog.create({ data: { actorId: null, action: 'admin.bootstrap', targetId: user.id, reason: 'Trusted local operator granted administrator access' } });
    });
    console.log('Administrator granted. Refresh your session/profile.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Bootstrap failed'); process.exitCode = 1; });
