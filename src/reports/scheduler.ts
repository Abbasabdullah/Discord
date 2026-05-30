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

  // ── 9 AM Daily (Sat–Thu): Joke + Tasks Briefing + Report ─────
  // Friday is a day off in Bahrain — skip Friday (5)
  console.log(`📅 Morning briefing (Sat–Thu): "0 9 * * 0-4,6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 9 * * 0-4,6', async () => {
    console.log('\n🌅 Sending morning briefing...');

    // Joke
    try {
      const joke = await generateJoke();
      await sendToAIChannel({ content: `**Good morning! 🌞**\n\n${joke}` });
    } catch (err) {
      console.error('❌ Failed to send morning joke:', err);
    }

    // Daily tasks briefing — grouped by team member
    try {
      const sqlite = getSqlite();
      const members = ['Hasan', 'Hussain', 'Abbas', 'Anas'];
      const allOpen = sqlite.prepare(`
        SELECT id, title, priority, assigned_to, project FROM tickets
        WHERE status != 'closed' ORDER BY assigned_to, priority DESC
      `).all() as any[];

      const byMember: Record<string, any[]> = {};
      const unassigned: any[] = [];
      for (const t of allOpen) {
        if (t.assigned_to && members.includes(t.assigned_to)) {
          if (!byMember[t.assigned_to]) byMember[t.assigned_to] = [];
          byMember[t.assigned_to].push(t);
        } else if (!t.assigned_to) {
          unassigned.push(t);
        }
      }

      const prioEmoji: Record<string, string> = { urgent: '🚨', high: '🟧', medium: '🟩', low: '🟦' };
      let msg = `📋 **Today's Tasks — ${new Date().toLocaleDateString('en-US', { timeZone: env.REPORT_TIMEZONE, weekday: 'long', month: 'short', day: 'numeric' })}**\n`;

      for (const name of members) {
        const tasks = byMember[name] ?? [];
        msg += `\n**👤 ${name}** (${tasks.length} open)\n`;
        if (tasks.length === 0) {
          msg += `• No open tasks 🎉\n`;
        } else {
          for (const t of tasks.slice(0, 8)) {
            const proj = t.project ? ` [${t.project}]` : '';
            msg += `• ${prioEmoji[t.priority] ?? '•'} #${t.id} ${t.title}${proj}\n`;
          }
          if (tasks.length > 8) msg += `• _…and ${tasks.length - 8} more_\n`;
        }
      }

      if (unassigned.length > 0) {
        msg += `\n**⚠️ Unassigned (${unassigned.length})**\n`;
        for (const t of unassigned.slice(0, 5)) {
          msg += `• #${t.id} ${t.title}\n`;
        }
        if (unassigned.length > 5) msg += `• _…and ${unassigned.length - 5} more_\n`;
      }

      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Failed to send daily tasks briefing:', err);
    }

    // Report to report channel
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

  // ── 4 PM Task Registration Reminder (Sat–Thu only) ──────────
  console.log(`📋 Task reminder: "0 16 * * 0-4,6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 16 * * 0-4,6', async () => {
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

  // ── Saturday 8 AM: Weekly standup report (Bahrain week starts Sat) ──
  console.log(`📋 Saturday standup: "0 8 * * 6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 8 * * 6', async () => {
    console.log('\n📋 Posting Saturday standup...');
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

      let msg = `📋 **Good morning team! Saturday standup — new week starts now!** 🌅\n\n**Open Tasks by Member:**\n`;
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

  // ── Wednesday 4 PM: Mid-week sales check (2 days left) ──────
  console.log(`💰 Wednesday sales push: "0 16 * * 3" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 16 * * 3', async () => {
    console.log('\n💰 Wednesday sales push...');
    try {
      const target = getCurrentTarget();
      if (!target) return;
      const gap = target.targetAmount - target.currentAmount;
      const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
      let msg = '';
      if (pct >= 100) {
        msg = `🎉 **SALES TARGET SMASHED!** ${pct}% — ${target.currentAmount} ${target.currency} vs target of ${target.targetAmount}! Incredible work with 2 days still left! 🏆`;
      } else if (pct >= 75) {
        msg = `🔥 **Sales Check — 2 days left!**\n\nAt **${pct}%** (${target.currentAmount}/${target.targetAmount} ${target.currency})\nJust **${gap} ${target.currency}** to close — you're SO close! Let's finish strong! 💪`;
      } else if (pct >= 50) {
        msg = `⚡ **Sales Check — Push time!**\n\nAt **${pct}%** (${target.currentAmount}/${target.targetAmount} ${target.currency})\n**${gap} ${target.currency}** gap with Wed + Thu left. Every conversation counts! 🚀`;
      } else {
        msg = `💪 **Sales Check — Time to sprint!**\n\nAt **${pct}%** (${target.currentAmount}/${target.targetAmount} ${target.currency})\n**${gap} ${target.currency}** remaining — Wednesday afternoon + all of Thursday. Big gap = big opportunity. Who's got a hot lead? 🔥`;
      }
      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Wednesday sales push error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ── Thursday 1 PM: Final day of the work week push ───────────
  console.log(`💰 Thursday final push: "0 13 * * 4" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 13 * * 4', async () => {
    console.log('\n💰 Thursday final push...');
    try {
      const target = getCurrentTarget();
      if (!target) return;
      const gap = target.targetAmount - target.currentAmount;
      const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
      let msg = '';
      if (pct >= 100) {
        msg = `🏆 **GOAL ACHIEVED!** What a week — ${target.currentAmount} ${target.currency} smashed the ${target.targetAmount} target! Enjoy your weekend, legends! 🎊`;
      } else {
        msg = `🚨 **LAST DAY — THURSDAY FINAL PUSH!**\n\nAt **${pct}%** — **${gap} ${target.currency}** remaining\n\nThis is it! Tomorrow is Friday (off). Every call, every proposal, every follow-up you do in the next few hours counts. Let's close this week strong! 🔥💪`;
      }
      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Thursday final push error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });
}
