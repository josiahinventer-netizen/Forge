import { describe, expect, it } from 'vitest';
import { orderedTodos, todoReminderText, todoTiming } from '../services/todoPlanning';
import type { Todo } from '../types/models';

const todo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'todo',
  title: 'Sharpen blade',
  description: '',
  purpose: 'Make safer cuts',
  status: 'Open',
  priority: 'Normal',
  linkedSkillIds: [],
  linkedResourceIds: [],
  linkedCapabilityIds: [],
  completionNotes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  archived: false,
  ...overrides,
});

describe('todo planning', () => {
  const at = new Date('2026-08-02T12:00:00.000Z');
  it('distinguishes overdue, reminder-due, upcoming, unscheduled, and completed tasks', () => {
    expect(todoTiming(todo({ dueAt: '2026-08-02T11:00:00.000Z' }), at)).toBe('Overdue');
    expect(
      todoTiming(todo({ scheduledFor: '2026-08-02T12:10:00.000Z', reminderMinutesBefore: 15 }), at),
    ).toBe('Reminder due');
    expect(
      todoTiming(todo({ scheduledFor: '2026-08-02T13:00:00.000Z', reminderMinutesBefore: 15 }), at),
    ).toBe('Upcoming');
    expect(todoTiming(todo(), at)).toBe('Unscheduled');
    expect(todoTiming(todo({ status: 'Completed' }), at)).toBe('Completed');
  });

  it('orders urgent reminders before lower-priority upcoming work and explains why', () => {
    const upcoming = todo({
      id: 'upcoming',
      title: 'Later',
      scheduledFor: '2026-08-02T13:00:00.000Z',
    });
    const urgent = todo({ id: 'urgent', priority: 'Urgent', dueAt: '2026-08-02T11:00:00.000Z' });
    expect(orderedTodos([upcoming, urgent], at).map((item) => item.id)).toEqual([
      'urgent',
      'upcoming',
    ]);
    expect(todoReminderText(urgent)).toBe('Sharpen blade — Make safer cuts');
  });
});
