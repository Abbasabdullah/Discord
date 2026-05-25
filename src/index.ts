import './config/env'; // Validate env vars first
import { runMigrations } from './db/index';
import { connectToDiscord } from './discord/client';
import { startReportScheduler } from './reports/scheduler';
import { startDashboard } from './dashboard/server';

async function main() {
  console.log('🚀 Task Advisor — Discord Bot + Dashboard');
  console.log('==========================================\n');

  // 1. Run DB migrations
  console.log('📦 Setting up database...');
  runMigrations();
  console.log('✅ Database ready\n');

  // 2. Start daily report scheduler
  startReportScheduler();

  // 3. Connect to Discord
  await connectToDiscord();

  // 4. Start web dashboard
  await startDashboard();

  // 5. Graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

function shutdown() {
  console.log('\n👋 Shutting down...');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
