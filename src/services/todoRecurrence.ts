import type { Todo, TodoOccurrence, TodoRecurrence } from '../types/models';

function advance(value: string | undefined, recurrence: TodoRecurrence): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (recurrence.frequency === 'Monthly') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + recurrence.interval);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  } else
    date.setUTCDate(
      date.getUTCDate() + recurrence.interval * (recurrence.frequency === 'Weekly' ? 7 : 1),
    );
  return date.toISOString();
}

export function nextRecurringDates(todo: Todo): { scheduledFor?: string; dueAt?: string } | null {
  if (!todo.recurrence) return null;
  return {
    scheduledFor: advance(todo.scheduledFor, todo.recurrence),
    dueAt: advance(todo.dueAt, todo.recurrence),
  };
}

export function occurrenceFromTodo(todo: Todo, completedAt: string, id: string): TodoOccurrence {
  return {
    id,
    todoId: todo.id,
    title: todo.title,
    purpose: todo.purpose,
    scheduledFor: todo.scheduledFor,
    dueAt: todo.dueAt,
    completedAt,
    completionNotes: todo.completionNotes,
    checklist: (todo.checklist ?? []).map((item) => ({ ...item })),
    createdAt: completedAt,
    updatedAt: completedAt,
    tags: [...todo.tags],
    archived: false,
  };
}
