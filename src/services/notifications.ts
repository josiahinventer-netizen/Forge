import type { Todo } from '../types/models';
import { todoReminderText } from './todoPlanning';

const enabledKey = 'forge-notifications-enabled';
export const notificationsSupported = () => 'Notification' in window;
export const notificationsEnabled = () =>
  notificationsSupported() &&
  Notification.permission === 'granted' &&
  localStorage.getItem(enabledKey) === 'true';

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission = await Notification.requestPermission();
  const enabled = permission === 'granted';
  localStorage.setItem(enabledKey, String(enabled));
  return enabled;
}

export function disableNotifications() {
  localStorage.setItem(enabledKey, 'false');
}

export async function showTodoNotification(todo: Todo): Promise<void> {
  if (!notificationsEnabled()) return;
  const options: NotificationOptions = {
    body: todoReminderText(todo),
    tag: `forge-todo-${todo.id}`,
    icon: './icon.svg',
  };
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) await registration.showNotification('Forge reminder', options);
  else new Notification('Forge reminder', options);
}
