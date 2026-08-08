import type { EntityReference, MindEdge, MindNode, Todo, WorkState } from '../types/models';

export type TodoTiming = 'Overdue' | 'Reminder due' | 'Upcoming' | 'Unscheduled' | 'Completed';

export function todoTiming(todo: Todo, at = new Date()): TodoTiming {
  if (todo.status === 'Completed') return 'Completed';
  const now = at.getTime();
  if (todo.snoozedUntil && Date.parse(todo.snoozedUntil) > now) return 'Upcoming';
  if (todo.dueAt && Date.parse(todo.dueAt) < now) return 'Overdue';
  const target = todo.snoozedUntil ?? todo.scheduledFor ?? todo.dueAt;
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
      Date.parse(a.snoozedUntil ?? a.scheduledFor ?? a.dueAt ?? '9999-12-31') -
      Date.parse(b.snoozedUntil ?? b.scheduledFor ?? b.dueAt ?? '9999-12-31')
    );
  });
}

export function todoReminderText(todo: Todo) {
  return todo.purpose.trim() ? `${todo.title} — ${todo.purpose.trim()}` : todo.title;
}

export interface PlannedTodo {
  todo: Todo;
  score: number;
  reasons: string[];
  unlocks: string[];
  daysRemaining?: number;
}

export interface TodayPlan {
  actionableNow: PlannedTodo[];
  waiting: Todo[];
  blocked: Todo[];
  upcoming: Todo[];
  deferred: Todo[];
  currentFocus: MindNode[];
}

const workState = (todo: Todo): WorkState => todo.execution?.workState ?? 'actionable';
const key = (reference: EntityReference) => `${reference.entityType}:${reference.entityId}`;

function graphReach(
  todo: Todo,
  nodes: readonly MindNode[],
  edges: readonly MindEdge[],
): { labels: string[]; focusLabels: string[] } {
  const activeNodes = new Map(
    nodes.filter((node) => !node.archived).map((node) => [`mindNode:${node.id}`, node]),
  );
  const useful = new Set([
    'supports',
    'supports goal',
    'contributes to',
    'part of',
    'motivated by',
  ]);
  const queue = [`todo:${todo.id}`];
  const seen = new Set(queue);
  const labels: string[] = [];
  const focusLabels: string[] = [];
  for (let depth = 0; depth < 4 && queue.length; depth += 1) {
    const level = queue.splice(0);
    for (const current of level) {
      for (const edge of edges) {
        if (edge.archived || !useful.has(edge.relationshipType) || key(edge.source) !== current)
          continue;
        const targetKey = key(edge.target);
        if (seen.has(targetKey)) continue;
        seen.add(targetKey);
        queue.push(targetKey);
        const node = activeNodes.get(targetKey);
        if (node) {
          labels.push(node.title);
          if (node.tags.some((tag) => tag.toLowerCase() === 'current-focus'))
            focusLabels.push(node.title);
        }
      }
    }
  }
  return { labels: [...new Set(labels)], focusLabels: [...new Set(focusLabels)] };
}

export function planToday(
  todos: readonly Todo[],
  nodes: readonly MindNode[],
  edges: readonly MindEdge[],
  at = new Date(),
): TodayPlan {
  const now = at.getTime();
  const open = todos.filter((todo) => !todo.archived && todo.status !== 'Completed');
  const currentFocus = nodes.filter(
    (node) =>
      !node.archived &&
      node.tags.some((tag) => tag.toLowerCase() === 'current-focus') &&
      (node.type === 'goal' || node.type === 'project'),
  );
  const waiting = open.filter((todo) => workState(todo) === 'waiting');
  const blocked = open.filter((todo) => workState(todo) === 'blocked');
  const deferred = open.filter((todo) => ['deferred', 'someday'].includes(workState(todo)));
  const upcoming = open.filter((todo) => {
    const state = workState(todo);
    const available = todo.execution?.availableAfter ?? todo.scheduledFor;
    return state === 'scheduled' || (Boolean(available) && Date.parse(available!) > now);
  });
  const actionableNow = open
    .filter((todo) => {
      if (workState(todo) !== 'actionable') return false;
      const available = todo.execution?.availableAfter ?? todo.scheduledFor;
      return !available || Date.parse(available) <= now;
    })
    .map((todo): PlannedTodo => {
      let score = { Urgent: 35, High: 20, Normal: 10, Low: 0 }[todo.priority];
      const reasons: string[] = [];
      if (todo.priority !== 'Low') reasons.push(`${todo.priority.toLowerCase()} stated priority`);
      let daysRemaining: number | undefined;
      if (todo.dueAt) {
        daysRemaining = Math.ceil((Date.parse(todo.dueAt) - now) / 86_400_000);
        const deadline =
          daysRemaining < 0
            ? 100
            : daysRemaining <= 1
              ? 80
              : daysRemaining <= 3
                ? 55
                : daysRemaining <= 7
                  ? 30
                  : 0;
        score += deadline;
        if (deadline)
          reasons.push(
            daysRemaining < 0
              ? 'past its deadline'
              : `${todo.execution?.deadlineKind === 'hard' ? 'hard ' : ''}deadline in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
          );
      }
      const reach = graphReach(todo, nodes, edges);
      if (reach.focusLabels.length) {
        score += 40;
        reasons.push(`supports current focus: ${reach.focusLabels.join(', ')}`);
      }
      const unlockCount = Math.min(reach.labels.length, 4);
      if (unlockCount) {
        score += unlockCount * 8;
        reasons.push(`advances ${reach.labels.slice(0, 3).join(', ')}`);
      }
      if (todo.status === 'In progress') {
        score += 10;
        reasons.push('already in progress');
      }
      if (todo.estimatedMinutes && todo.estimatedMinutes <= 60) {
        score += 5;
        reasons.push(`fits in about ${todo.estimatedMinutes} minutes`);
      }
      if (todo.execution?.urgencyReason) reasons.push(todo.execution.urgencyReason);
      if (!reasons.length) reasons.push(todo.purpose || 'explicitly marked actionable');
      return { todo, score, reasons, unlocks: reach.labels, daysRemaining };
    })
    .sort(
      (left, right) => right.score - left.score || left.todo.title.localeCompare(right.todo.title),
    );
  return { actionableNow, waiting, blocked, upcoming, deferred, currentFocus };
}
