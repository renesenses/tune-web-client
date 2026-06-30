import { writable } from 'svelte/store';
import type { Album, Artist, StreamingServiceStatus } from '../types';

export const activeStreamingService = writable<string | null>(null);

export const streamingServices = writable<Record<string, StreamingServiceStatus>>({});

export const pendingStreamingAlbum = writable<Album | null>(null);
export const pendingStreamingArtist = writable<Artist | null>(null);

export interface GenreBreadcrumbItem {
  id: string | null;
  name: string;
}

export const streamingGenreBreadcrumb = writable<GenreBreadcrumbItem[]>([]);
