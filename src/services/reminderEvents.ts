import { db, now, type ForgeDatabase } from '../database/db';
import type { ReminderAction, ReminderEvent, Todo } from '../types/models';

export function reminderOccurrenceKey(todo: Todo): string {
  const target = todo.snoozedUntil ?? todo.scheduledFor ?? todo.dueAt ?? todo.updatedAt;
  return `${todo.id}:${target}`;
}

const reminderEventId = (occurrenceKey: string) => `reminder-${occurrenceKey}`;

export async function ensureReminderEvent(
  todo: Todo,
  database: ForgeDatabase = db,
): Promise<ReminderEvent> {
  const occurrenceKey = reminderOccurrenceKey(todo);
  const id = reminderEventId(occurrenceKey);
  const existing = await database.reminderEvents.get(id);
  if (existing) return existing;
  const timestamp = now();
  const event: ReminderEvent = {
    id,
    todoId: todo.id,
    occurrenceKey,
    title: todo.title,
    purpose: todo.purpose,
    scheduledFor: todo.scheduledFor,
    dueAt: todo.dueAt,
    detectedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
    archived: false,
  };
  await database.reminderEvents.put(event);
  return event;
}

export async function acknowledgeReminder(
  eventId: string,
  action: ReminderAction,
  database: ForgeDatabase = db,
): Promise<void> {
  const timestamp = now();
  await database.reminderEvents.update(eventId, {
    acknowledgedAt: timestamp,
    action,
    updatedAt: timestamp,
  });
}

export async function snoozeReminder(
  todo: Todo,
  eventId: string,
  minutes: number,
  database: ForgeDatabase = db,
): Promise<string> {
  const timestamp = now();
  const snoozedUntil = new Date(Date.parse(timestamp) + minutes * 60_000).toISOString();
  await database.transaction('rw', [database.todos, database.reminderEvents], async () => {
    await database.reminderEvents.update(eventId, {
      acknowledgedAt: timestamp,
      action: 'Snoozed',
      snoozedUntil,
      updatedAt: timestamp,
    });
    await database.todos.update(todo.id, { snoozedUntil, updatedAt: timestamp });
  });
  return snoozedUntil;
}
