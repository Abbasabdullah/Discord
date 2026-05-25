import { db } from '../db/index';
import { reminders } from '../db/schema';
import { eq, lte, and } from 'drizzle-orm';

export function createReminder(input: {
  userId: string;
  username: string;
  message: string;
  remindAt: number; // unix timestamp
}) {
  return db.insert(reminders).values(input).returning().get();
}

export function getDueReminders() {
  const now = Math.floor(Date.now() / 1000);
  return db
    .select()
    .from(reminders)
    .where(and(lte(reminders.remindAt, now), eq(reminders.sent, 0)))
    .all();
}

export function markReminderSent(id: number) {
  db.update(reminders).set({ sent: 1 }).where(eq(reminders.id, id)).run();
}

export function listReminders(userId: string) {
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, userId), eq(reminders.sent, 0)))
    .all();
}
