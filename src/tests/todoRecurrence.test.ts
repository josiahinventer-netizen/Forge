import { afterEach, describe, expect, it } from 'vitest';
import { ForgeDatabase } from '../database/db';
import { completeTodo, toggleTodoChecklistItem } from '../services/todoOperations';
import { nextRecurringDates, occurrenceFromTodo } from '../services/todoRecurrence';
import type { Todo } from '../types/models';

const databases: ForgeDatabase[] = [];
const todo = (recurrence?: Todo['recurrence']): Todo => ({
  id: 'routine',
  title: 'Morning walk',
  description: '',
  purpose: 'Start the day with movement',
  status: 'Open',
  priority: 'Normal',
  scheduledFor: '2026-08-03T15:00:00.000Z',
  dueAt: '2026-08-03T16:00:00.000Z',
  reminderMinutesBefore: 15,
  recurrence,
  linkedSkillIds: [],
  linkedResourceIds: [],
  linkedCapabilityIds: [],
  completionNotes: 'Completed outside',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  tags: ['routine'],
  archived: false,
  checklist: [
    {
      id: 'step-1',
      text: 'Put on shoes',
      completed: true,
      completedAt: '2026-08-03T14:55:00.000Z',
    },
  ],
});

afterEach(async () => Promise.all(databases.splice(0).map((database) => database.delete())));

describe('todo recurrence', () => {
  it('advances daily, weekly, and calendar-month dates exactly', () => {
    expect(nextRecurringDates(todo({ frequency: 'Daily', interval: 2 }))?.scheduledFor).toBe(
      '2026-08-05T15:00:00.000Z',
    );
    expect(nextRecurringDates(todo({ frequency: 'Weekly', interval: 1 }))?.dueAt).toBe(
      '2026-08-10T16:00:00.000Z',
    );
    expect(
      nextRecurringDates({
        ...todo({ frequency: 'Monthly', interval: 1 }),
        scheduledFor: '2026-08-15T15:00:00.000Z',
      })?.scheduledFor,
    ).toBe('2026-09-15T15:00:00.000Z');
    expect(
      nextRecurringDates({
        ...todo({ frequency: 'Monthly', interval: 1 }),
        scheduledFor: '2026-01-31T15:00:00.000Z',
      })?.scheduledFor,
    ).toBe('2026-02-28T15:00:00.000Z');
  });

  it('snapshots completion details without changing the source object', () => {
    const source = todo({ frequency: 'Daily', interval: 1 });
    const occurrence = occurrenceFromTodo(source, '2026-08-03T16:00:00.000Z', 'occurrence-1');
    expect(occurrence).toEqual(
      expect.objectContaining({
        todoId: 'routine',
        title: 'Morning walk',
        completionNotes: 'Completed outside',
      }),
    );
    expect(source.status).toBe('Open');
    expect(occurrence.checklist).toEqual(source.checklist);
    expect(occurrence.checklist).not.toBe(source.checklist);
  });

  it('preserves recurring completion history and opens the next occurrence', async () => {
    const database = new ForgeDatabase(`forge-recurrence-${crypto.randomUUID()}`);
    databases.push(database);
    await database.todos.put(todo({ frequency: 'Daily', interval: 1 }));
    await completeTodo('routine', database);
    const updated = await database.todos.get('routine');
    const history = await database.todoOccurrences.toArray();
    expect(updated?.status).toBe('Open');
    expect(updated?.scheduledFor).toBe('2026-08-04T15:00:00.000Z');
    expect(updated?.completionNotes).toBe('');
    expect(updated?.checklist).toEqual([{ id: 'step-1', text: 'Put on shoes', completed: false }]);
    expect(history).toHaveLength(1);
    expect(history[0]?.purpose).toBe('Start the day with movement');
  });

  it('completes a non-recurring todo without creating history', async () => {
    const database = new ForgeDatabase(`forge-once-${crypto.randomUUID()}`);
    databases.push(database);
    await database.todos.put(todo());
    await completeTodo('routine', database);
    expect((await database.todos.get('routine'))?.status).toBe('Completed');
    expect(await database.todoOccurrences.count()).toBe(0);
  });

  it('tracks individual steps and refuses completion while a step remains open', async () => {
    const database = new ForgeDatabase(`forge-checklist-${crypto.randomUUID()}`);
    databases.push(database);
    await database.todos.put({
      ...todo(),
      checklist: [
        { id: 'step-1', text: 'Put on shoes', completed: false },
        { id: 'step-2', text: 'Walk outside', completed: false },
      ],
    });

    await toggleTodoChecklistItem('routine', 'step-1', database);
    expect(await completeTodo('routine', database)).toBe(false);
    expect((await database.todos.get('routine'))?.status).toBe('In progress');
    expect((await database.todos.get('routine'))?.checklist?.[0]).toMatchObject({
      completed: true,
      completedAt: expect.any(String),
    });

    await toggleTodoChecklistItem('routine', 'step-2', database);
    expect(await completeTodo('routine', database)).toBe(true);
    expect((await database.todos.get('routine'))?.status).toBe('Completed');
  });
});
