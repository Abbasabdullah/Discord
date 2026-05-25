import cron from 'node-cron';
import { generateDailyReport, generateEveningReminder } from './report.service';
import { sendToReportChannel, sendToAIChannel } from '../discord/client';
import { db } from '../db/index';
import { reportLog } from '../db/schema';
import { env } from '../config/env';
import { genAI } from '../ai/gemini';
import { getDueReminders, markReminderSent } from '../tickets/reminder.service';

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
}
