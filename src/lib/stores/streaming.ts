import { writable } from 'svelte/store';
import type { StreamingServiceStatus } from '../types';

export const activeStreamingService = writable<string | null>(null);

export const streamingServices = writable<Record<string, StreamingServiceStatus>>({});
