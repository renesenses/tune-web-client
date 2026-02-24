import { writable } from 'svelte/store';

export type ConnectionState = 'connected' | 'disconnected' | 'connecting';

export const connectionState = writable<ConnectionState>('disconnected');
