import { afterEach, describe, expect, it } from 'vitest';
import { ForgeDatabase } from '../database/db';
import {
  acknowledgeReminder,
  ensureReminderEvent,
  reminderOccurrenceKey,
  snoozeReminder,
} from '../services/reminderEvents';
import { completeTodo } from '../services/todoOperations';
import type { Todo } from '../types/models';

const databases: ForgeDatabase[] = [];
const todo = (): Todo => ({
  id: 'todo-1',
  title: 'Check equipment',
  description: '',
  purpose: 'Prevent breakdowns',
  status: 'Open',
  priority: 'High',
  scheduledFor: '2026-08-03T12:00:00.000Z',
  dueAt: '2026-08-03T13:00:00.000Z',
  reminderMinutesBefore: 15,
  linkedSkillIds: [],
  linkedResourceIds: [],
  linkedCapabilityIds: [],
  completionNotes: '',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  tags: [],
  archived: false,
});

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('persistent reminder events', () => {
  it('uses a stable occurrence identity and creates one event on repeated detection', async () => {
    const database = new ForgeDatabase(`forge-reminder-${crypto.randomUUID()}`);
    databases.push(database);
    const item = todo();
    await database.todos.put(item);
    const first = await ensureReminderEvent(item, database);
    const second = await ensureReminderEvent(item, database);
    expect(first.id).toBe(second.id);
    expect(first.occurrenceKey).toBe(reminderOccurrenceKey(item));
    expect(await database.reminderEvents.count()).toBe(1);
  });

  it('records acknowledgement and persistent snooze actions', async () => {
    const database = new ForgeDatabase(`forge-snooze-${crypto.randomUUID()}`);
    databases.push(database);
    const item = todo();
    await database.todos.put(item);
    const event = await ensureReminderEvent(item, database);
    const before = Date.now();
    await snoozeReminder(item, event.id, 10, database);
    const snoozedUntil = (await database.todos.get(item.id))?.snoozedUntil;
    expect(Date.parse(snoozedUntil!)).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(await database.reminderEvents.get(event.id)).toEqual(
      expect.objectContaining({ action: 'Snoozed', acknowledgedAt: expect.any(String) }),
    );
    const snoozed = (await database.todos.get(item.id))!;
    expect(reminderOccurrenceKey(snoozed)).not.toBe(event.occurrenceKey);
    const next = await ensureReminderEvent(snoozed, database);
    await acknowledgeReminder(next.id, 'Acknowledged', database);
    expect((await database.reminderEvents.get(next.id))?.action).toBe('Acknowledged');
  });

  it('atomically records completion against its reminder', async () => {
    const database = new ForgeDatabase(`forge-reminder-complete-${crypto.randomUUID()}`);
    databases.push(database);
    const item = todo();
    await database.todos.put(item);
    const event = await ensureReminderEvent(item, database);
    await completeTodo(item.id, database, event.id);
    expect((await database.todos.get(item.id))?.status).toBe('Completed');
    expect((await database.reminderEvents.get(event.id))?.action).toBe('Completed');
  });
});
