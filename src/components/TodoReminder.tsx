import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../database/db';
import { orderedTodos, todoReminderText, todoTiming } from '../services/todoPlanning';
import { showTodoNotification } from '../services/notifications';
import {
  acknowledgeReminder,
  ensureReminderEvent,
  reminderOccurrenceKey,
  snoozeReminder,
} from '../services/reminderEvents';
import { completeTodo } from '../services/todoOperations';

export function TodoReminder() {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const todos =
    useLiveQuery(
      () => db.todos.filter((todo) => !todo.archived && todo.status !== 'Completed').toArray(),
      [],
    ) ?? [];
  const due = orderedTodos(todos, new Date(clock)).find((todo) =>
    ['Overdue', 'Reminder due'].includes(todoTiming(todo, new Date(clock))),
  );
  const events =
    useLiveQuery(() => db.reminderEvents.filter((event) => !event.archived).toArray(), []) ?? [];
  const occurrenceKey = due ? reminderOccurrenceKey(due) : undefined;
  const event = events.find((item) => item.occurrenceKey === occurrenceKey);
  const visible = due && !event?.acknowledgedAt ? due : undefined;
  useEffect(() => {
    if (!visible || !occurrenceKey) return;
    void ensureReminderEvent(visible).then((saved) => {
      if (saved.acknowledgedAt) return;
      const key = `forge-notified-${occurrenceKey}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
      void showTodoNotification(visible);
    });
  }, [visible, occurrenceKey]);
  return visible ? (
    <section className="todo-reminder" role="alert">
      <div>
        <strong>{todoTiming(visible, new Date(clock))}:</strong> {todoReminderText(visible)}{' '}
        <Link to="/todos">Open todos</Link>
      </div>
      <div className="actions">
        <button
          className="secondary"
          onClick={async () => {
            const saved = event ?? (await ensureReminderEvent(visible));
            await snoozeReminder(visible, saved.id, 10);
          }}
        >
          Snooze 10 min
        </button>
        <button
          className="secondary"
          onClick={async () => {
            const saved = event ?? (await ensureReminderEvent(visible));
            await acknowledgeReminder(saved.id, 'Acknowledged');
          }}
        >
          Acknowledge
        </button>
        <button
          disabled={(visible.checklist ?? []).some((item) => !item.completed)}
          title={
            (visible.checklist ?? []).some((item) => !item.completed)
              ? 'Open the todo and complete its checklist first.'
              : undefined
          }
          onClick={async () => {
            const saved = event ?? (await ensureReminderEvent(visible));
            await completeTodo(visible.id, db, saved.id);
          }}
        >
          Complete
        </button>
      </div>
    </section>
  ) : null;
}
