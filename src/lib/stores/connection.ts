import { writable } from 'svelte/store';

export type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'reconnecting';

export const connectionState = writable<ConnectionState>('disconnected');

/** Number of consecutive reconnection attempts (resets to 0 on successful connect). */
export const reconnectAttempts = writable<number>(0);
