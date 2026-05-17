import { writable } from 'svelte/store';

export type HealthStatus = 'ok' | 'warning' | 'critical';

/** Global health status, updated by App.svelte on WS events and by Sidebar on poll. */
export const healthStatus = writable<HealthStatus>('ok');
