import { describe, expect, it } from 'vitest';
import { orderedTodos, planToday, todoReminderText, todoTiming } from '../services/todoPlanning';
import type { MindEdge, MindNode, Todo } from '../types/models';

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
    expect(
      todoTiming(
        todo({ dueAt: '2026-08-02T11:00:00.000Z', snoozedUntil: '2026-08-02T12:10:00.000Z' }),
        at,
      ),
    ).toBe('Upcoming');
    expect(
      todoTiming(
        todo({ dueAt: '2026-08-02T11:00:00.000Z', snoozedUntil: '2026-08-02T11:59:00.000Z' }),
        at,
      ),
    ).toBe('Overdue');
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

  it('never recommends waiting, blocked, deferred, or future-scheduled work as actionable', () => {
    const plan = planToday(
      [
        todo({
          id: 'do',
          title: 'Do now',
          execution: { workState: 'actionable', blockedBy: [], contexts: [] },
        }),
        todo({
          id: 'wait',
          execution: { workState: 'waiting', waitingOn: 'Agency', blockedBy: [], contexts: [] },
        }),
        todo({
          id: 'block',
          execution: {
            workState: 'blocked',
            blockedReason: 'Missing part',
            blockedBy: [],
            contexts: [],
          },
        }),
        todo({ id: 'later', execution: { workState: 'deferred', blockedBy: [], contexts: [] } }),
        todo({
          id: 'future',
          execution: {
            workState: 'actionable',
            availableAfter: '2026-08-03T12:00:00.000Z',
            blockedBy: [],
            contexts: [],
          },
        }),
      ],
      [],
      [],
      at,
    );
    expect(plan.actionableNow.map((item) => item.todo.id)).toEqual(['do']);
    expect(plan.waiting.map((item) => item.id)).toEqual(['wait']);
    expect(plan.blocked.map((item) => item.id)).toEqual(['block']);
    expect(plan.deferred.map((item) => item.id)).toEqual(['later']);
    expect(plan.upcoming.map((item) => item.id)).toEqual(['future']);
  });

  it('surfaces a hard deadline ahead of ordinary work with an inspectable reason', () => {
    const deadline = todo({
      id: 'deadline',
      title: 'Make payment',
      dueAt: '2026-08-03T12:00:00.000Z',
      execution: { workState: 'actionable', deadlineKind: 'hard', blockedBy: [], contexts: [] },
    });
    const ordinary = todo({ id: 'ordinary', priority: 'High' });
    const plan = planToday([ordinary, deadline], [], [], at);
    expect(plan.actionableNow[0]?.todo.id).toBe('deadline');
    expect(plan.actionableNow[0]?.reasons).toContain('hard deadline in 1 day');
  });

  it('derives focus alignment and multi-hop unblock value from explicit graph relationships', () => {
    const baseNode = {
      description: '',
      notes: '',
      status: 'active' as const,
      confidence: 80,
      importance: 90,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archived: false,
    };
    const nodes: MindNode[] = [
      { ...baseNode, id: 'project', title: 'Prepare house', type: 'project', tags: [] },
      {
        ...baseNode,
        id: 'focus',
        title: 'Financial stability',
        type: 'goal',
        tags: ['current-focus'],
      },
    ];
    const edgeBase = {
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      archived: false,
    };
    const edges: MindEdge[] = [
      {
        ...edgeBase,
        id: 'one',
        source: { entityType: 'todo', entityId: 'basement' },
        target: { entityType: 'mindNode', entityId: 'project' },
        relationshipType: 'supports',
      },
      {
        ...edgeBase,
        id: 'two',
        source: { entityType: 'mindNode', entityId: 'project' },
        target: { entityType: 'mindNode', entityId: 'focus' },
        relationshipType: 'supports goal',
      },
    ];
    const plan = planToday(
      [todo({ id: 'basement', title: 'Fix basement', priority: 'Normal' })],
      nodes,
      edges,
      at,
    );
    expect(plan.actionableNow[0]?.unlocks).toEqual(['Prepare house', 'Financial stability']);
    expect(plan.actionableNow[0]?.reasons).toContain('supports current focus: Financial stability');
    expect(plan.currentFocus[0]?.id).toBe('focus');
  });
});
