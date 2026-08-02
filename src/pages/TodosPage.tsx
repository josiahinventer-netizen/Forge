import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { baseRecord, db, now } from '../database/db';
import type { Todo, TodoPriority, TodoStatus } from '../types/models';
import { TODO_PRIORITIES } from '../types/models';
import { orderedTodos, todoTiming } from '../services/todoPlanning';
import { Card, Empty, Field, Modal, Page, formatDate } from '../components/UI';

const emptyTodo = (): Todo => ({
  ...baseRecord(),
  title: '',
  description: '',
  purpose: '',
  status: 'Open',
  priority: 'Normal',
  linkedSkillIds: [],
  linkedResourceIds: [],
  linkedCapabilityIds: [],
  completionNotes: '',
  reminderMinutesBefore: 15,
});
const localInput = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const isoInput = (value: string) => (value ? new Date(value).toISOString() : undefined);

export function TodosPage() {
  const todos = useLiveQuery(() => db.todos.filter((todo) => !todo.archived).toArray(), []) ?? [];
  const links = useLiveQuery(
    async () => ({
      skills: await db.skills.filter((item) => !item.archived).toArray(),
      resources: await db.resources.filter((item) => !item.archived).toArray(),
      capabilities: await db.capabilities.filter((item) => !item.archived).toArray(),
    }),
    [],
  ) ?? { skills: [], resources: [], capabilities: [] };
  const [edit, setEdit] = useState<Todo | null>(null);
  const [query, setQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const shown = orderedTodos(todos).filter(
    (todo) =>
      (showCompleted || todo.status !== 'Completed') &&
      `${todo.title} ${todo.purpose} ${todo.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const toggle = (
    field: 'linkedSkillIds' | 'linkedResourceIds' | 'linkedCapabilityIds',
    id: string,
  ) => {
    if (!edit) return;
    const values = edit[field];
    setEdit({
      ...edit,
      [field]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    });
  };
  return (
    <Page
      title="Todos"
      subtitle="Plan what to do, when to do it, and why it matters"
      action={<button onClick={() => setEdit(emptyTodo())}>+ Add todo</button>}
    >
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search todos"
          aria-label="Search todos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(event) => setShowCompleted(event.target.checked)}
          />{' '}
          Show completed
        </label>
      </div>
      {shown.length ? (
        <div className="list">
          {shown.map((todo) => {
            const timing = todoTiming(todo);
            return (
              <Card key={todo.id}>
                <div className="row">
                  <div>
                    <span className={`status todo-${timing.toLowerCase().replaceAll(' ', '-')}`}>
                      {timing}
                    </span>
                    <span className="pill">{todo.priority}</span>
                    <h3>{todo.title}</h3>
                    {todo.purpose && (
                      <p>
                        <strong>Why:</strong> {todo.purpose}
                      </p>
                    )}
                    <p className="muted">
                      {todo.scheduledFor
                        ? `Scheduled ${formatDate(todo.scheduledFor)}`
                        : 'Unscheduled'}
                      {todo.dueAt ? ` · Due ${formatDate(todo.dueAt)}` : ''}
                      {todo.estimatedMinutes ? ` · ${todo.estimatedMinutes} min` : ''}
                    </p>
                  </div>
                  <div className="actions vertical">
                    <button className="secondary" onClick={() => setEdit(todo)}>
                      Edit
                    </button>
                    {todo.status !== 'Completed' && (
                      <button
                        onClick={async () => {
                          const timestamp = now();
                          await db.todos.update(todo.id, {
                            status: 'Completed',
                            completedAt: timestamp,
                            updatedAt: timestamp,
                          });
                        }}
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>Add something meaningful you want to accomplish.</Empty>
      )}
      {edit && (
        <Modal title={edit.title ? 'Edit todo' : 'Add todo'} onClose={() => setEdit(null)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await db.todos.put({
                ...edit,
                updatedAt: now(),
                completedAt: edit.status === 'Completed' ? (edit.completedAt ?? now()) : undefined,
              });
              setEdit(null);
            }}
          >
            <Field label="What needs doing?">
              <input
                required
                autoFocus
                value={edit.title}
                onChange={(event) => setEdit({ ...edit, title: event.target.value })}
              />
            </Field>
            <Field label="Why am I doing this?">
              <textarea
                required
                value={edit.purpose}
                onChange={(event) => setEdit({ ...edit, purpose: event.target.value })}
                placeholder="Connect this task to a goal, responsibility, person, or capability."
              />
            </Field>
            <Field label="Details">
              <textarea
                value={edit.description}
                onChange={(event) => setEdit({ ...edit, description: event.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Status">
                <select
                  value={edit.status}
                  onChange={(event) =>
                    setEdit({ ...edit, status: event.target.value as TodoStatus })
                  }
                >
                  <option>Open</option>
                  <option>In progress</option>
                  <option>Completed</option>
                </select>
              </Field>
              <Field label="Priority">
                <select
                  value={edit.priority}
                  onChange={(event) =>
                    setEdit({ ...edit, priority: event.target.value as TodoPriority })
                  }
                >
                  {TODO_PRIORITIES.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </Field>
              <Field label="Scheduled start">
                <input
                  type="datetime-local"
                  value={localInput(edit.scheduledFor)}
                  onChange={(event) =>
                    setEdit({ ...edit, scheduledFor: isoInput(event.target.value) })
                  }
                />
              </Field>
              <Field label="Due">
                <input
                  type="datetime-local"
                  value={localInput(edit.dueAt)}
                  onChange={(event) => setEdit({ ...edit, dueAt: isoInput(event.target.value) })}
                />
              </Field>
              <Field label="Estimated minutes">
                <input
                  type="number"
                  min="0"
                  value={edit.estimatedMinutes ?? ''}
                  onChange={(event) =>
                    setEdit({
                      ...edit,
                      estimatedMinutes: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Remind minutes before">
                <input
                  type="number"
                  min="0"
                  value={edit.reminderMinutesBefore ?? ''}
                  onChange={(event) =>
                    setEdit({
                      ...edit,
                      reminderMinutesBefore: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
              </Field>
            </div>
            <fieldset>
              <legend>Connected records</legend>
              {(
                [
                  ['Skills', 'linkedSkillIds', links.skills],
                  ['Resources', 'linkedResourceIds', links.resources],
                  ['Capabilities', 'linkedCapabilityIds', links.capabilities],
                ] as const
              ).map(([label, field, records]) => (
                <div key={label} className="link-options">
                  <strong>{label}</strong>
                  {records.length ? (
                    records.map((record) => (
                      <label className="check" key={record.id}>
                        <input
                          type="checkbox"
                          checked={edit[field].includes(record.id)}
                          onChange={() => toggle(field, record.id)}
                        />{' '}
                        {record.name}
                      </label>
                    ))
                  ) : (
                    <span className="muted"> None available</span>
                  )}
                </div>
              ))}
            </fieldset>
            <Field label="Completion notes">
              <textarea
                value={edit.completionNotes}
                onChange={(event) => setEdit({ ...edit, completionNotes: event.target.value })}
              />
            </Field>
            <div className="actions">
              <button>Save todo</button>
              {todos.some((todo) => todo.id === edit.id) && (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    if (!confirm('Archive this todo? It will remain in your data.')) return;
                    await db.todos.update(edit.id, { archived: true, updatedAt: now() });
                    setEdit(null);
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </Page>
  );
}
