import cron from 'node-cron';
import { generateDailyReport, generateEveningReminder } from './report.service';
import { sendToReportChannel, sendToAIChannel } from '../discord/client';
import { db, getSqlite } from '../db/index';
import { reportLog } from '../db/schema';
import { env } from '../config/env';
import { genAI } from '../ai/gemini';
import { getDueReminders, markReminderSent } from '../tickets/reminder.service';
import { getCurrentTarget } from '../sales/sales.service';
import {
  generateSmartBriefing,
  checkDeadlines,
  checkIdleMembers,
  checkWorkloadImbalance,
  checkWins,
  checkFollowUps,
  generateMeetingPrep,
  checkMeetingOutcomesDue,
  generateMeetingRegistrationPrompt,
  generateSalesValueReport,
  checkPipelineHealth,
  checkFulfillmentHealth,
  checkWonDealsAwaitingFulfillment,
  generateClientCheckInRoster,
} from '../ai/proactive';

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

/** Send a message, splitting into chunks if over 2000 chars */
async function sendChunked(text: string) {
  if (text.length <= 2000) {
    await sendToAIChannel({ content: text });
    return;
  }
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 2000) {
      await sendToAIChannel({ content: remaining });
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', 2000);
    if (splitAt < 500) splitAt = 2000;
    await sendToAIChannel({ content: remaining.slice(0, splitAt) });
    remaining = remaining.slice(splitAt).trim();
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

  // ══════════════════════════════════════════════════════════════
  // 9 AM SMART MORNING BRIEFING (Sat–Thu)
  // Joke + personalized tasks + smart nudges per member
  // ══════════════════════════════════════════════════════════════
  console.log(`📅 Smart morning briefing: "0 9 * * 0-4,6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 9 * * 0-4,6', async () => {
    console.log('\n🧠 Generating smart morning briefing...');

    // Joke
    try {
      const joke = await generateJoke();
      await sendToAIChannel({ content: `**Good morning! 🌞**\n\n${joke}` });
    } catch (err) {
      console.error('❌ Joke error:', err);
    }

    // Smart personalized briefing
    try {
      const briefing = generateSmartBriefing();
      await sendChunked(briefing);
    } catch (err) {
      console.error('❌ Smart briefing error:', err);
    }

    // Report embed to report channel
    if (env.DISCORD_REPORT_CHANNEL_ID) {
      try {
        const { embed, count } = generateDailyReport();
        await sendToReportChannel({ embeds: [embed] });
        db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID, ticketCount: count, status: 'success' }).run();
      } catch (err) {
        console.error('❌ Morning report error:', err);
        db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID ?? 'unknown', ticketCount: 0, status: 'failed' }).run();
      }
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // 10 AM PROACTIVE BRAIN (Sat–Thu)
  // Deadline alerts + follow-up nudges + meeting outcome chase + pipeline health
  // ══════════════════════════════════════════════════════════════
  console.log(`🧠 Proactive brain (10 AM): "0 10 * * 0-4,6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 10 * * 0-4,6', async () => {
    console.log('\n🧠 Running proactive brain — 10 AM...');

    // Deadline alerts
    try {
      const deadlines = checkDeadlines();
      if (deadlines) await sendToAIChannel({ content: deadlines });
    } catch (err) {
      console.error('❌ Deadline check error:', err);
    }

    // Follow-up nudges
    try {
      const followUps = checkFollowUps();
      if (followUps) await sendToAIChannel({ content: followUps });
    } catch (err) {
      console.error('❌ Follow-up check error:', err);
    }

    // Meeting outcome chase (yesterday/prior meetings without outcome)
    try {
      const outcomes = checkMeetingOutcomesDue();
      if (outcomes) await sendChunked(outcomes);
    } catch (err) {
      console.error('❌ Meeting outcome chase error:', err);
    }

    // Pipeline health
    try {
      const health = checkPipelineHealth();
      if (health) await sendChunked(health);
    } catch (err) {
      console.error('❌ Pipeline health error:', err);
    }

    // Fulfillment health
    try {
      const fh = checkFulfillmentHealth();
      if (fh) await sendChunked(fh);
    } catch (err) {
      console.error('❌ Fulfillment health error:', err);
    }

    // Won deals awaiting kickoff
    try {
      const waiting = checkWonDealsAwaitingFulfillment();
      if (waiting) await sendChunked(waiting);
    } catch (err) {
      console.error('❌ Won deals waiting check error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // 1 PM PROACTIVE BRAIN (Sat–Thu)
  // Idle detection + workload imbalance + wins celebration
  // ══════════════════════════════════════════════════════════════
  console.log(`🧠 Proactive brain (1 PM): "0 13 * * 0-4,6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 13 * * 0-4,6', async () => {
    console.log('\n🧠 Running proactive brain — 1 PM...');

    // Idle member detection
    try {
      const idle = checkIdleMembers();
      if (idle) await sendToAIChannel({ content: idle });
    } catch (err) {
      console.error('❌ Idle check error:', err);
    }

    // Workload imbalance
    try {
      const imbalance = checkWorkloadImbalance();
      if (imbalance) await sendToAIChannel({ content: imbalance });
    } catch (err) {
      console.error('❌ Workload check error:', err);
    }

    // Auto-celebrate wins
    try {
      const wins = checkWins();
      if (wins) await sendToAIChannel({ content: wins });
    } catch (err) {
      console.error('❌ Wins check error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // 4 PM MEETING REGISTRATION + TASK REMINDER (Sat–Thu)
  // ══════════════════════════════════════════════════════════════
  console.log(`📋 4 PM meeting & task prompt: "0 16 * * 0-4,6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 16 * * 0-4,6', async () => {
    console.log('\n📋 4 PM meeting & task prompt...');
    try {
      const prompt = generateMeetingRegistrationPrompt();
      await sendChunked(prompt);
    } catch (err) {
      console.error('❌ 4 PM prompt error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // SUNDAY 9:30 AM — MEETING PREP
  // Auto-generated summary before the 10 AM weekly meeting
  // ══════════════════════════════════════════════════════════════
  console.log(`📊 Meeting prep: "30 9 * * 0" (${env.REPORT_TIMEZONE})`);
  cron.schedule('30 9 * * 0', async () => {
    console.log('\n📊 Generating meeting prep...');
    try {
      const prep = generateMeetingPrep();
      await sendChunked(prep);
    } catch (err) {
      console.error('❌ Meeting prep error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // SUNDAY 10 AM — WEEKLY MEETING REMINDER
  // ══════════════════════════════════════════════════════════════
  console.log(`📅 Weekly meeting: "0 10 * * 0" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 10 * * 0', async () => {
    console.log('\n📅 Weekly meeting reminder...');
    try {
      await sendToAIChannel({
        content: `🗓️ **Weekly Meeting — Starting Now!**\n\nThe prep summary was posted above ☝️ — use it as your agenda.\n\nAfter the meeting, send me a voice note and I'll extract all action items for the team! 🎙️`,
      });
    } catch (err) {
      console.error('❌ Meeting reminder error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // SATURDAY 9 AM — CLIENT CHECK-IN ROSTER
  // ══════════════════════════════════════════════════════════════
  console.log(`📞 Saturday client roster: "0 9 * * 6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 9 * * 6', async () => {
    console.log('\n📞 Saturday client roster...');
    try {
      const roster = generateClientCheckInRoster();
      if (roster) await sendChunked(roster);
    } catch (err) {
      console.error('❌ Client roster error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // SATURDAY 8 AM — NEW WEEK STANDUP
  // ══════════════════════════════════════════════════════════════
  console.log(`📋 Saturday standup: "0 8 * * 6" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 8 * * 6', async () => {
    console.log('\n📋 Saturday standup — new week...');
    try {
      const sqlite = getSqlite();
      const lastWeekTs = Math.floor(Date.now() / 1000) - 7 * 86400;

      const closedLastWeek = (sqlite.prepare(`
        SELECT COUNT(*) as c FROM tickets WHERE status = 'closed' AND closed_at > ?
      `).get(lastWeekTs) as any).c;

      const createdLastWeek = (sqlite.prepare(`
        SELECT COUNT(*) as c FROM tickets WHERE created_at > ?
      `).get(lastWeekTs) as any).c;

      const totalOpen = (sqlite.prepare(`
        SELECT COUNT(*) as c FROM tickets WHERE status != 'closed'
      `).get() as any).c;

      // Sales last week recap
      const target = getCurrentTarget();
      let salesRecap = '';
      if (target) {
        const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
        salesRecap = `\n💰 Last week sales: ${target.currentAmount}/${target.targetAmount} ${target.currency} (${pct}%)`;
        if (pct >= 100) salesRecap += ' — TARGET HIT! 🏆';
      }

      let msg = `📋 **New Week — Saturday Standup** 🌅\n\n`;
      msg += `**Last Week Recap:**\n`;
      msg += `• ✅ ${closedLastWeek} ticket(s) closed\n`;
      msg += `• 📝 ${createdLastWeek} new ticket(s) created\n`;
      msg += `• 📊 ${totalOpen} ticket(s) still open${salesRecap}\n`;

      // Task debt warning
      if (createdLastWeek > closedLastWeek && closedLastWeek > 0) {
        msg += `\n⚠️ **Task debt growing** — created ${createdLastWeek} but only closed ${closedLastWeek}. Focus on closing this week!\n`;
      }

      // Fresh smart briefing for the new week
      msg += `\n${generateSmartBriefing()}`;

      await sendChunked(msg);
    } catch (err) {
      console.error('❌ Saturday standup error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // 10 PM — EVENING WRAP-UP
  // ══════════════════════════════════════════════════════════════
  console.log(`🌙 Evening wrap-up: "0 22 * * *" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 22 * * *', async () => {
    console.log('\n🌙 Evening wrap-up...');

    // Celebrate any wins from today
    try {
      const wins = checkWins();
      if (wins) await sendToAIChannel({ content: wins });
    } catch (err) {
      console.error('❌ Evening wins error:', err);
    }

    // Send report embed
    if (env.DISCORD_REPORT_CHANNEL_ID) {
      try {
        const { embed, count } = generateEveningReminder();
        await sendToReportChannel({ embeds: [embed] });
        db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID, ticketCount: count, status: 'success' }).run();
      } catch (err) {
        console.error('❌ Evening report error:', err);
        db.insert(reportLog).values({ recipient: env.DISCORD_REPORT_CHANNEL_ID ?? 'unknown', ticketCount: 0, status: 'failed' }).run();
      }
    }
  }, { timezone: env.REPORT_TIMEZONE });

  // ══════════════════════════════════════════════════════════════
  // SALES PUSH — WEDNESDAY 4 PM + THURSDAY 1 PM
  // ══════════════════════════════════════════════════════════════
  console.log(`💰 Wednesday sales value report: "0 16 * * 3" (${env.REPORT_TIMEZONE})`);
  cron.schedule('0 16 * * 3', async () => {
    console.log('\n💰 Wednesday sales value report...');
    try {
      const report = generateSalesValueReport();
      await sendChunked(report);
    } catch (err) {
      console.error('❌ Wednesday sales report error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });

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
        msg = `🏆 **GOAL ACHIEVED!** ${target.currentAmount} ${target.currency} smashed the ${target.targetAmount} target! Enjoy your weekend! 🎊`;
      } else {
        msg = `🚨 **LAST DAY — THURSDAY FINAL PUSH!**\n\nAt **${pct}%** — **${gap} ${target.currency}** remaining\n\nTomorrow is Friday (off). Every call, every follow-up counts NOW. Let's close this week strong! 🔥💪`;
      }
      await sendToAIChannel({ content: msg });
    } catch (err) {
      console.error('❌ Thursday push error:', err);
    }
  }, { timezone: env.REPORT_TIMEZONE });
}
