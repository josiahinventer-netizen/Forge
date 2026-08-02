import type { Todo } from '../types/models';

export type TodoTiming = 'Overdue' | 'Reminder due' | 'Upcoming' | 'Unscheduled' | 'Completed';

export function todoTiming(todo: Todo, at = new Date()): TodoTiming {
  if (todo.status === 'Completed') return 'Completed';
  const now = at.getTime();
  if (todo.dueAt && Date.parse(todo.dueAt) < now) return 'Overdue';
  const target = todo.scheduledFor ?? todo.dueAt;
  if (!target) return 'Unscheduled';
  const reminderAt = Date.parse(target) - (todo.reminderMinutesBefore ?? 0) * 60_000;
  return reminderAt <= now ? 'Reminder due' : 'Upcoming';
}

const priorityWeight = { Urgent: 0, High: 1, Normal: 2, Low: 3 } as const;

export function orderedTodos(todos: Todo[], at = new Date()) {
  const timingWeight: Record<TodoTiming, number> = {
    Overdue: 0,
    'Reminder due': 1,
    Upcoming: 2,
    Unscheduled: 3,
    Completed: 4,
  };
  return [...todos].sort((a, b) => {
    const timing = timingWeight[todoTiming(a, at)] - timingWeight[todoTiming(b, at)];
    if (timing) return timing;
    const priority = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (priority) return priority;
    return (
      Date.parse(a.scheduledFor ?? a.dueAt ?? '9999-12-31') -
      Date.parse(b.scheduledFor ?? b.dueAt ?? '9999-12-31')
    );
  });
}

export function todoReminderText(todo: Todo) {
  return todo.purpose.trim() ? `${todo.title} — ${todo.purpose.trim()}` : todo.title;
}
