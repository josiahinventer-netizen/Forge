import { db, now, uid, type ForgeDatabase } from '../database/db';
import { nextRecurringDates, occurrenceFromTodo } from './todoRecurrence';

export async function completeTodo(
  todoId: string,
  database: ForgeDatabase = db,
  reminderEventId?: string,
): Promise<boolean> {
  const timestamp = now();
  return database.transaction(
    'rw',
    [database.todos, database.todoOccurrences, database.reminderEvents],
    async () => {
      const todo = await database.todos.get(todoId);
      if (!todo || todo.archived || todo.status === 'Completed') return false;
      if ((todo.checklist ?? []).some((item) => !item.completed)) return false;
      if (reminderEventId)
        await database.reminderEvents.update(reminderEventId, {
          acknowledgedAt: timestamp,
          action: 'Completed',
          updatedAt: timestamp,
        });
      const next = nextRecurringDates(todo);
      if (!next) {
        await database.todos.update(todo.id, {
          status: 'Completed',
          completedAt: timestamp,
          updatedAt: timestamp,
        });
        return true;
      }
      await database.todoOccurrences.put(occurrenceFromTodo(todo, timestamp, uid()));
      await database.todos.update(todo.id, {
        status: 'Open',
        scheduledFor: next.scheduledFor,
        dueAt: next.dueAt,
        completedAt: undefined,
        completionNotes: '',
        snoozedUntil: undefined,
        checklist: (todo.checklist ?? []).map((item) => ({
          ...item,
          completed: false,
          completedAt: undefined,
        })),
        updatedAt: timestamp,
      });
      return true;
    },
  );
}

export async function toggleTodoChecklistItem(
  todoId: string,
  itemId: string,
  database: ForgeDatabase = db,
): Promise<void> {
  const todo = await database.todos.get(todoId);
  if (!todo || todo.archived || todo.status === 'Completed') return;
  const timestamp = now();
  const checklist = (todo.checklist ?? []).map((item) =>
    item.id === itemId
      ? {
          ...item,
          completed: !item.completed,
          completedAt: item.completed ? undefined : timestamp,
        }
      : item,
  );
  await database.todos.update(todo.id, {
    checklist,
    status:
      todo.status === 'Open' && checklist.some((item) => item.completed)
        ? 'In progress'
        : todo.status,
    updatedAt: timestamp,
  });
}
