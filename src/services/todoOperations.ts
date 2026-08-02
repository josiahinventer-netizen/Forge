import { db, now, uid, type ForgeDatabase } from '../database/db';
import { nextRecurringDates, occurrenceFromTodo } from './todoRecurrence';

export async function completeTodo(
  todoId: string,
  database: ForgeDatabase = db,
  reminderEventId?: string,
): Promise<void> {
  const timestamp = now();
  await database.transaction(
    'rw',
    [database.todos, database.todoOccurrences, database.reminderEvents],
    async () => {
      const todo = await database.todos.get(todoId);
      if (!todo || todo.archived || todo.status === 'Completed') return;
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
        return;
      }
      await database.todoOccurrences.put(occurrenceFromTodo(todo, timestamp, uid()));
      await database.todos.update(todo.id, {
        status: 'Open',
        scheduledFor: next.scheduledFor,
        dueAt: next.dueAt,
        completedAt: undefined,
        completionNotes: '',
        snoozedUntil: undefined,
        updatedAt: timestamp,
      });
    },
  );
}
