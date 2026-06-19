// Internals partagés entre les sous-modules api/*.
// Préfixe `_` = ne pas importer côté composants ; passer par `lib/api`.

import { notifications } from '../stores/notifications';
import { getToken, clearToken } from '../auth';

export const BASE = '/api/v1';

let _lastNetworkError = 0;
function showNetworkError() {
  const now = Date.now();
  if (now - _lastNetworkError < 5000) return;
  _lastNetworkError = now;
  notifications.error('Network error: server unreachable');
}

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
    const token = getToken();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    response = await fetch(url, {
      headers,
      ...options,
    });
  } catch (e) {
    showNetworkError();
    throw e;
  }
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      throw new Error('Session expired');
    }
    throw await apiError(response);
  }
  const text = await response.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}
