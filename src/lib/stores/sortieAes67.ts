/**
 * La Sortie AES67 est-elle là ? — pour montrer ou non sa section des Réglages.
 *
 * `GET /api/v1/ext/aes67` rend 404 quand le greffon n'est pas installé : la
 * section disparaît alors (état `absente`), sans toast ni bandeau.
 * `inconnue` (pas encore su) laisse la section affichée.
 */
import { writable } from 'svelte/store';

export type PresenceAes67 = 'inconnue' | 'presente' | 'absente';
export const presenceSortieAes67 = writable<PresenceAes67>('inconnue');
