import { writable } from 'svelte/store';

export const activeStreamingService = writable<string | null>(null);
