import cron from 'node-cron';
import { generateDailyReport, generateEveningReminder } from './report.service';
import { sendToReportChannel, sendToAIChannel } from '../discord/client';
import { db, getSqlite } from '../db/index';
import { reportLog } from '../db/schema';
import { env } from '../config/env';
import { genAI } from '../ai/gemini';
import { getDueReminders, markReminderSent } from '../tickets/reminder.service';
import { getCurrentTarget } from '../sales/sales.service';

async function generateJoke(): Promise<string> {
  try {
    const model  = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
    const result = await model.generateContent(
      `Generate a short, clever joke or fun fact for a tech/software team starting their workday.
      Make it funny AND useful or thought-provoking. Keep it under 3 lines.
      Format: start with an emoji, then the joke/tip. No intro text, just the joke.`
    );
    return result.response.text().trim();
  } catch {
    return '☕ Remember: the best code is the code you don\'t have to write!';
  }
}

export function startReportScheduler() {
  // ── Every minute: Reminder dispatcher ───────────────────────
  cron.schedule('* * * * *', async () => {
    const due = getDueReminders();
    for (const reminder of due) {
      try {
        await sendToAIChannel({ content: `⏰ <@${reminder.userId}> **Reminder:** ${reminder.message}` });
        markReminderSent(reminder.id);
        console.log(`✅ Reminder sent to ${reminder.username}: ${reminder.message}`);
      } catch (err) {
        console.error(`❌ Failed to send reminder #${reminder.id}:`, err);
      }
    }
  });

  // ── 9 AM Morning: Joke + Daily Report ────────────────────────
  console.log(`📅 Morning (joke + report): "0 9 * * *" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 9 * * *', async () => {
    console.log('\n🌅 Sending morning joke + report...');
    try {
      const joke = await generateJoke();
      await sendToAIChannel({ content: `**Good morning! 🌞**\n\n${joke}` });
    } catch (err) {
      console.error('❌ Failed to send morning joke:', err);
    }

    if (!env.DISCORD_REPORT_CHANNEL_ID) return;
    try {
      const { embed, count } = generateDailyReport();
      await sendToReportChannel({ embeds: [embed] });
      db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID, ticketCount: count, status: 'success' }).run();
      console.log(`✅ Morning report sent (${count} open tickets)`);
    } catch (err) {
      console.error('❌ Failed to send morning report:', err);
      db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID ?? 'unknown', ticketCount: 0, status: 'failed' }).run();
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── 4 PM Task Registration Reminder ──────────────────────────
  console.log(`📋 Task reminder: "0 16 * * *" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 16 * * *', async () => {
    console.log('\n📋 Sending 4PM task reminder...');
    try {
      await sendToAIChannel({
        content: `⏰ **Daily Reminder** — It's 4:00 PM!\n\nPlease make sure you've logged all your tasks for today. If you have anything in progress or pending, update it now so the team stays in sync. 📝\n\nType a message here or use \`/create-ticket\` to log tasks.`,
      });
    } catch (err) {
      console.error('❌ Failed to send task reminder:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── Sunday 10 AM Weekly Meeting Reminder ─────────────────────
  console.log(`📅 Weekly meeting reminder: "0 10 * * 0" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 10 * * 0', async () => {
    console.log('\n📅 Sending weekly meeting reminder...');
    try {
      await sendToAIChannel({
        content: `🗓️ **Weekly Meeting — Starting Now!**\n\nGood morning everyone! Our weekly team meeting is starting at 10 AM. 🚀\n\nPlease join and be ready to share your updates. After the meeting, send me a voice note with the summary and I'll extract the action items for the whole team. 🎙️`,
      });
    } catch (err) {
      console.error('❌ Failed to send weekly meeting reminder:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── 10 PM Evening Reminder ────────────────────────────────────
  console.log(`🌙 Evening reminder: "0 22 * * *" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 22 * * *', async () => {
    console.log('\n🌙 Sending evening reminder...');
    if (!env.DISCORD_REPORT_CHANNEL_ID) return;
    try {
      const { embed, count } = generateEveningReminder();
      await sendToReportChannel({ embeds: [embed] });
      db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID, ticketCount: count, status: 'success' }).run();
      console.log(`✅ Evening reminder sent (${count} open tickets)`);
    } catch (err) {
      console.error('❌ Failed to send evening reminder:', err);
      db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID ?? 'unknown', ticketCount: 0, status: 'failed' }).run();
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── Monday 8 AM: Weekly standup report ───────────────────────
  console.log(`📋 Monday standup: "0 8 * * 1" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 8 * * 1', async () => {
    console.log('\n📋 Posting Monday standup...');
    try {
      const sqlite = getSqlite();
      const lastWeekTs = Math.floor(Date.now() / 1000) - 7 * 86400;

      const openByMember = sqlite.prepare(`
        SELECT assigned_to, COUNT(*) as count
        FROM tickets WHERE status != 'closed' AND assigned_to IS NOT NULL
        GROUP BY assigned_to ORDER BY assigned_to
      `).all() as any[];

      const closedLastWeek = sqlite.prepare(`
        SELECT COUNT(*) as count FROM tickets WHERE status = 'closed' AND closed_at > ?
      `).get(lastWeekTs) as any;

      const urgent = sqlite.prepare(`
        SELECT id, title, assigned_to FROM tickets WHERE priority = 'urgent' AND status != 'closed'
      `).all() as any[];

      const unassigned = sqlite.prepare(`
        SELECT COUNT(*) as count FROM tickets WHERE assigned_to IS NULL AND status != 'closed'
      `).get() as any;

      let msg = `📋 **Good morning team! Monday standup** 🌅\n\n**Open Tasks by Member:**\n`;
      for (const row of openByMember) {
        msg += `👤 **${row.assigned_to}** — ${row.count} open\n`;
      }
      if (unassigned.count > 0) msg += `⚠️ **${unassigned.count} unassigned** — needs an owner!\n`;
      msg += `\n✅ Closed last 7 days: **${closedLastWeek.count}**\n`;
      if (urgent.length > 0) {
        msg += `\n🚨 **Urgent:**\n`;
        for (const t of urgent) msg += `• #${t.id} ${t.title} (${t.assigned_to ?? 'unassigned'})\n`;
      }
      msg += `\nLet's have a great week! 💪`;

      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Standup error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── Daily 10 AM: Stale task check (5+ days no update) ────────
  console.log(`🔍 Stale task check: "0 10 * * *" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 10 * * *', async () => {
    console.log('\n🔍 Checking stale tasks...');
    try {
      const sqlite = getSqlite();
      const fiveDaysAgo = Math.floor(Date.now() / 1000) - 5 * 86400;
      const stale = sqlite.prepare(`
        SELECT id, title, assigned_to, updated_at
        FROM tickets
        WHERE status != 'closed' AND updated_at < ? AND assigned_to IS NOT NULL
        ORDER BY updated_at ASC LIMIT 10
      `).all(fiveDaysAgo) as any[];

      if (stale.length === 0) return;

      let msg = `⏰ **Stale Tasks** — ${stale.length} ticket(s) haven't been touched in 5+ days:\n\n`;
      for (const t of stale) {
        const days = Math.floor((Date.now() / 1000 - t.updated_at) / 86400);
        msg += `• **#${t.id}** ${t.title} — ${t.assigned_to} _(${days}d ago)_\n`;
      }
      msg += `\nPlease update or close if done! ✅`;

      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Stale check error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── Thursday 4 PM: End-of-week sales push ────────────────────
  console.log(`💰 Thursday sales push: "0 16 * * 4" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 16 * * 4', async () => {
    console.log('\n💰 Thursday sales push...');
    try {
      const target = getCurrentTarget();
      if (!target) return;
      const gap = target.targetAmount - target.currentAmount;
      const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
      let msg = '';
      if (pct >= 100) {
        msg = `🎉 **SALES TARGET SMASHED!** You're at ${pct}% — ${target.currentAmount} ${target.currency} vs target of ${target.targetAmount}! Absolute legends! 🏆`;
      } else if (pct >= 75) {
        msg = `🔥 **Sales Check — 2 days left!**\n\nAt **${pct}%** (${target.currentAmount}/${target.targetAmount} ${target.currency})\nOnly **${gap} ${target.currency}** to go — you are SO close! One or two more deals and it's done! 💪`;
      } else if (pct >= 50) {
        msg = `⚡ **Sales Check — Let's push!**\n\nAt **${pct}%** (${target.currentAmount}/${target.targetAmount} ${target.currency})\n**${gap} ${target.currency}** gap — 2 days left. Every conversation counts! 🚀`;
      } else {
        msg = `💪 **Sales Check — Sprint time!**\n\nAt **${pct}%** (${target.currentAmount}/${target.targetAmount} ${target.currency})\n**${gap} ${target.currency}** remaining — Thursday + Friday are power days. Who's got a hot lead? Let's close! 🔥`;
      }
      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Thursday sales push error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── Friday 1 PM: Final day push ───────────────────────────────
  console.log(`💰 Friday final push: "0 13 * * 5" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 13 * * 5', async () => {
    console.log('\n💰 Friday final push...');
    try {
      const target = getCurrentTarget();
      if (!target) return;
      const gap = target.targetAmount - target.currentAmount;
      const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
      let msg = '';
      if (pct >= 100) {
        msg = `🏆 **GOAL ACHIEVED!** What a week — ${target.currentAmount} ${target.currency} smashed the ${target.targetAmount} target! You're an incredible team! 🎊`;
      } else {
        msg = `🚨 **FINAL FRIDAY PUSH!**\n\nAt ${pct}% — **${gap} ${target.currency}** remaining\n\nThis is it team! Every call, every follow-up, every proposal sent TODAY counts. Who's closing something right now? Let's end the week strong! 🔥💪`;
      }
      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Friday push error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });
}
