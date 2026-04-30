// Internals partagés entre les sous-modules api/*.
// Préfixe `_` = ne pas importer côté composants ; passer par `lib/api`.

import { notifications } from '../stores/notifications';

export const BASE = '/api/v1';

async function apiError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body.detail) detail = body.detail;
  } catch {
    /* ignore */
  }
  return new Error(detail);
}

export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (e) {
    notifications.error('Network error: server unreachable');
    throw e;
  }
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json();
}
