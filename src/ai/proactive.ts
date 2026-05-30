/**
 * Proactive AI Brain
 *
 * Scans tickets, roadmap, sales, and team activity to generate
 * contextual nudges — runs on cron, not on user request.
 */
import { getSqlite } from '../db/index';
import { getCurrentTarget } from '../sales/sales.service';
import { env } from '../config/env';

const TEAM = ['Hasan', 'Hussain', 'Abbas', 'Anas'];
const now = () => Math.floor(Date.now() / 1000);

// ─────────────────────────────────────────────────────────────
// 1. Smart Personalized Morning Briefing
//    Per-member context: stale tasks, overdue follow-ups, workload warnings
// ─────────────────────────────────────────────────────────────
export function generateSmartBriefing(): string {
  const db     = getSqlite();
  const ts     = now();
  const dayStr = new Date().toLocaleDateString('en-US', {
    timeZone: env.REPORT_TIMEZONE, weekday: 'long', month: 'short', day: 'numeric',
  });

  const prioEmoji: Record<string, string> = { urgent: '🚨', high: '🟧', medium: '🟩', low: '🟦' };

  // All open tickets
  const allOpen = db.prepare(`
    SELECT id, title, priority, assigned_to, project, updated_at FROM tickets
    WHERE status != 'closed' ORDER BY priority DESC
  `).all() as any[];

  const byMember: Record<string, any[]> = {};
  const unassigned: any[] = [];
  for (const t of allOpen) {
    if (t.assigned_to && TEAM.includes(t.assigned_to)) {
      if (!byMember[t.assigned_to]) byMember[t.assigned_to] = [];
      byMember[t.assigned_to].push(t);
    } else if (!t.assigned_to) {
      unassigned.push(t);
    }
  }

  // Sales context
  const target = getCurrentTarget();
  let salesLine = '';
  if (target) {
    const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
    const gap = target.targetAmount - target.currentAmount;
    if (pct >= 100) {
      salesLine = `\n💰 **Sales: ${pct}% — TARGET ACHIEVED!** 🏆\n`;
    } else {
      salesLine = `\n💰 **Sales: ${target.currentAmount}/${target.targetAmount} ${target.currency} (${pct}%)** — ${gap} ${target.currency} to go\n`;
    }
  }

  let msg = `🌅 **Good morning team!** ${dayStr}\n${salesLine}`;

  // Per member section with smart context
  for (const name of TEAM) {
    const tasks = byMember[name] ?? [];
    const stale = tasks.filter(t => (ts - t.updated_at) > 5 * 86400);
    const followUps = tasks.filter(t => t.title.toLowerCase().includes('follow up') && (ts - t.updated_at) > 3 * 86400);
    const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');

    msg += `\n**👤 ${name}** — ${tasks.length} open`;
    if (stale.length > 0) msg += ` ⚠️ ${stale.length} stale`;
    msg += `\n`;

    if (tasks.length === 0) {
      msg += `• No open tasks — ready for new assignments! 🎉\n`;
      continue;
    }

    // Show urgent/high first
    for (const t of urgentTasks.slice(0, 3)) {
      const proj = t.project ? ` [${t.project}]` : '';
      msg += `• ${prioEmoji[t.priority]} #${t.id} ${t.title}${proj}\n`;
    }

    // Then others (up to 5 total)
    const shown = new Set(urgentTasks.slice(0, 3).map(t => t.id));
    let count = shown.size;
    for (const t of tasks) {
      if (count >= 5) break;
      if (shown.has(t.id)) continue;
      const proj = t.project ? ` [${t.project}]` : '';
      msg += `• ${prioEmoji[t.priority] ?? '•'} #${t.id} ${t.title}${proj}\n`;
      count++;
    }
    if (tasks.length > 5) msg += `• _…and ${tasks.length - 5} more_\n`;

    // Smart nudges per member
    if (followUps.length > 0) {
      msg += `↳ 📞 _${followUps.length} follow-up(s) need attention:_ ${followUps.map(t => `#${t.id}`).join(', ')}\n`;
    }
    if (stale.length > 0 && stale.length !== followUps.length) {
      msg += `↳ ⏰ _${stale.length} task(s) untouched 5+ days_\n`;
    }
  }

  // Unassigned
  if (unassigned.length > 0) {
    msg += `\n**⚠️ Unassigned (${unassigned.length})** — need owners!\n`;
    for (const t of unassigned.slice(0, 4)) {
      msg += `• #${t.id} ${t.title}\n`;
    }
    if (unassigned.length > 4) msg += `• _…and ${unassigned.length - 4} more_\n`;
  }

  // Workload imbalance check
  const counts = TEAM.map(n => ({ name: n, count: (byMember[n] ?? []).length }));
  counts.sort((a, b) => b.count - a.count);
  if (counts[0].count > 0 && counts[0].count >= counts[counts.length - 1].count * 3) {
    msg += `\n⚖️ **Workload imbalance:** ${counts[0].name} has ${counts[0].count} tasks, ${counts[counts.length - 1].name} has ${counts[counts.length - 1].count}. Consider rebalancing!\n`;
  }

  msg += `\nLet's have a productive day! 💪`;
  return msg;
}

// ─────────────────────────────────────────────────────────────
// 2. Deadline Proximity Alerts (roadmap + tickets)
//    Returns null if nothing is due
// ─────────────────────────────────────────────────────────────
export function checkDeadlines(): string | null {
  const db = getSqlite();
  const ts = now();
  const threeDays = ts + 3 * 86400;
  const alerts: string[] = [];

  // Roadmap items with target dates
  const upcoming = db.prepare(`
    SELECT id, title, target_date, status FROM roadmap_items
    WHERE target_date IS NOT NULL AND status != 'done'
    ORDER BY target_date ASC
  `).all() as any[];

  for (const item of upcoming) {
    const daysLeft = Math.ceil((item.target_date - ts) / 86400);
    if (daysLeft < 0) {
      alerts.push(`❌ **OVERDUE** (${Math.abs(daysLeft)}d): _${item.title}_ — update or extend the deadline!`);
    } else if (daysLeft === 0) {
      alerts.push(`🚨 **DUE TODAY**: _${item.title}_ — is this shipping today?`);
    } else if (daysLeft <= 3) {
      alerts.push(`⚡ **${daysLeft} day(s) left**: _${item.title}_`);
    }
  }

  if (alerts.length === 0) return null;
  return `📅 **Deadline Alerts**\n\n${alerts.join('\n')}`;
}

// ─────────────────────────────────────────────────────────────
// 3. Idle Member Detection
//    Members who haven't had any ticket activity in 3+ days
// ─────────────────────────────────────────────────────────────
export function checkIdleMembers(): string | null {
  const db = getSqlite();
  const ts = now();
  const threeDaysAgo = ts - 3 * 86400;
  const nudges: string[] = [];

  for (const name of TEAM) {
    // Check most recent ticket update for this member
    const latest = db.prepare(`
      SELECT MAX(updated_at) as last_active FROM tickets
      WHERE assigned_to = ? AND status != 'closed'
    `).get(name) as any;

    const openCount = (db.prepare(`
      SELECT COUNT(*) as c FROM tickets WHERE assigned_to = ? AND status != 'closed'
    `).get(name) as any).c;

    if (openCount > 0 && latest.last_active && latest.last_active < threeDaysAgo) {
      const days = Math.floor((ts - latest.last_active) / 86400);
      nudges.push(`• **${name}** — ${openCount} open tasks, no updates in ${days} days`);
    }
  }

  if (nudges.length === 0) return null;
  return `👀 **Team Activity Check**\n\nHaven't heard from:\n${nudges.join('\n')}\n\nEverything OK? Please update your tasks or let the team know! 💬`;
}

// ─────────────────────────────────────────────────────────────
// 4. Workload Imbalance Alert
// ─────────────────────────────────────────────────────────────
export function checkWorkloadImbalance(): string | null {
  const db = getSqlite();
  const counts = TEAM.map(name => {
    const row = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE assigned_to = ? AND status != 'closed'`).get(name) as any;
    return { name, count: row.c };
  });
  counts.sort((a, b) => b.count - a.count);

  const heaviest = counts[0];
  const lightest = counts[counts.length - 1];

  // Only alert if heaviest has 3x+ more than lightest AND heaviest has 10+
  if (heaviest.count >= 10 && lightest.count > 0 && heaviest.count >= lightest.count * 3) {
    return `⚖️ **Workload Alert**\n\n${heaviest.name} has **${heaviest.count}** open tasks while ${lightest.name} has only **${lightest.count}**.\n\nConsider reassigning some of ${heaviest.name}'s tasks to ${lightest.name}. Balance keeps the team healthy! 💪`;
  }

  if (heaviest.count >= 15) {
    return `⚖️ **Workload Alert**\n\n${heaviest.name} has **${heaviest.count}** open tasks — that's a lot! Consider closing completed ones or redistributing.\n\nFull breakdown: ${counts.map(c => `${c.name}: ${c.count}`).join(' | ')}`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// 5. Auto-Celebrate Wins
//    Check if any member closed 3+ tickets today, or pipeline hit target
// ─────────────────────────────────────────────────────────────
export function checkWins(): string | null {
  const db = getSqlite();
  const ts = now();
  const todayStart = ts - (ts % 86400); // rough start of today UTC
  const celebrations: string[] = [];

  // Members who closed multiple tickets today
  const closers = db.prepare(`
    SELECT assigned_to, COUNT(*) as closed FROM tickets
    WHERE status = 'closed' AND closed_at > ? AND assigned_to IS NOT NULL
    GROUP BY assigned_to HAVING closed >= 2
    ORDER BY closed DESC
  `).all(todayStart) as any[];

  for (const c of closers) {
    if (c.closed >= 5) {
      celebrations.push(`🔥 **${c.assigned_to}** closed **${c.closed} tickets** today! UNSTOPPABLE! 🏆`);
    } else if (c.closed >= 3) {
      celebrations.push(`🎉 **${c.assigned_to}** crushed **${c.closed} tickets** today! On fire!`);
    } else {
      celebrations.push(`✅ **${c.assigned_to}** closed **${c.closed} tickets** today — nice work!`);
    }
  }

  // Sales milestone
  const target = getCurrentTarget();
  if (target) {
    const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
    if (pct >= 100) {
      celebrations.push(`💰 **SALES TARGET ACHIEVED!** ${target.currentAmount}/${target.targetAmount} ${target.currency} — incredible work team! 🏆`);
    } else if (pct >= 75 && pct < 80) {
      // Just crossed 75%
      celebrations.push(`💰 Pipeline just crossed **75%**! Almost there — ${target.targetAmount - target.currentAmount} ${target.currency} to go! 🔥`);
    }
  }

  // Roadmap items completed today
  const doneToday = db.prepare(`
    SELECT COUNT(*) as c FROM roadmap_items WHERE status = 'done' AND updated_at > ?
  `).get(todayStart) as any;
  if (doneToday.c > 0) {
    celebrations.push(`🗺️ **${doneToday.c} roadmap item(s)** marked as done today! Progress! 🚀`);
  }

  if (celebrations.length === 0) return null;
  return `🎊 **Wins Update**\n\n${celebrations.join('\n')}`;
}

// ─────────────────────────────────────────────────────────────
// 6. Follow-Up Specific Nudges
//    Tickets with "follow up" in title that haven't been updated
// ─────────────────────────────────────────────────────────────
export function checkFollowUps(): string | null {
  const db = getSqlite();
  const ts = now();
  const threeDaysAgo = ts - 3 * 86400;

  const overdue = db.prepare(`
    SELECT id, title, assigned_to, updated_at FROM tickets
    WHERE status != 'closed' AND LOWER(title) LIKE '%follow%'
      AND updated_at < ? AND assigned_to IS NOT NULL
    ORDER BY updated_at ASC LIMIT 10
  `).all(threeDaysAgo) as any[];

  if (overdue.length === 0) return null;

  let msg = `📞 **Follow-Up Check** — ${overdue.length} follow-up(s) need attention:\n\n`;
  for (const t of overdue) {
    const days = Math.floor((ts - t.updated_at) / 86400);
    msg += `• **#${t.id}** ${t.title} — ${t.assigned_to} _(${days}d since last update)_\n`;
  }
  msg += `\nDid you reach out? Update the ticket or close if done! ✅`;
  return msg;
}

// ─────────────────────────────────────────────────────────────
// 7. Meeting Prep Summary (Sunday 9:30 AM)
//    What happened last week, what's blocked, roadmap progress
// ─────────────────────────────────────────────────────────────
export function generateMeetingPrep(): string {
  const db = getSqlite();
  const ts = now();
  const oneWeekAgo = ts - 7 * 86400;

  // Closed last week per member
  const closedPerMember = db.prepare(`
    SELECT assigned_to, COUNT(*) as closed FROM tickets
    WHERE status = 'closed' AND closed_at > ? AND assigned_to IS NOT NULL
    GROUP BY assigned_to
  `).all(oneWeekAgo) as any[];

  // Created last week
  const createdCount = (db.prepare(`
    SELECT COUNT(*) as c FROM tickets WHERE created_at > ?
  `).get(oneWeekAgo) as any).c;

  // Open per member
  const openPerMember = db.prepare(`
    SELECT assigned_to, COUNT(*) as c FROM tickets
    WHERE status != 'closed' AND assigned_to IS NOT NULL
    GROUP BY assigned_to
  `).all() as any[];

  // Stale (not updated 5+ days)
  const staleCount = (db.prepare(`
    SELECT COUNT(*) as c FROM tickets
    WHERE status != 'closed' AND updated_at < ?
  `).get(ts - 5 * 86400) as any).c;

  // Roadmap progress
  const roadmapStats = db.prepare(`
    SELECT status, COUNT(*) as c FROM roadmap_items GROUP BY status
  `).all() as any[];
  const rmMap = new Map(roadmapStats.map((r: any) => [r.status, r.c]));

  // Sales last week
  const target = getCurrentTarget();

  let msg = `📊 **Meeting Prep — Week in Review**\n\n`;

  // What got done
  msg += `**✅ Completed Last Week:**\n`;
  if (closedPerMember.length === 0) {
    msg += `• No tickets closed 😬\n`;
  } else {
    const closedMap = new Map(closedPerMember.map((r: any) => [r.assigned_to, r.closed]));
    for (const name of TEAM) {
      const closed = closedMap.get(name) ?? 0;
      if (closed > 0) msg += `• **${name}** closed ${closed} ticket(s)\n`;
    }
  }
  msg += `• ${createdCount} new ticket(s) created\n`;

  // Current state
  msg += `\n**📋 Current Open Tasks:**\n`;
  const openMap = new Map(openPerMember.map((r: any) => [r.assigned_to, r.c]));
  for (const name of TEAM) {
    msg += `• ${name}: ${openMap.get(name) ?? 0} open\n`;
  }

  // Blockers
  if (staleCount > 0) {
    msg += `\n**⚠️ Attention Needed:**\n`;
    msg += `• ${staleCount} stale ticket(s) — not updated in 5+ days\n`;
  }

  // Roadmap
  msg += `\n**🗺️ Roadmap Status:**\n`;
  msg += `• Planned: ${rmMap.get('planned') ?? 0} | In Progress: ${rmMap.get('in_progress') ?? 0} | Done: ${rmMap.get('done') ?? 0}\n`;

  // Sales
  if (target) {
    const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
    msg += `\n**💰 Sales:** ${target.currentAmount}/${target.targetAmount} ${target.currency} (${pct}%)\n`;
  }

  msg += `\n_Use this as your meeting agenda. Send a voice note after and I'll create the action items! 🎙️_`;
  return msg;
}
