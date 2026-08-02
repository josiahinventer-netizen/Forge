import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../database/db';
import { orderedTodos, todoReminderText, todoTiming } from '../services/todoPlanning';

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
  return due ? (
    <Link to="/todos" className="todo-reminder" role="status">
      <strong>{todoTiming(due, new Date(clock))}:</strong> {todoReminderText(due)}
    </Link>
  ) : null;
}
