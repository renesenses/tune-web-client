/**
 * DÉMO — maquettes Tune Circle de Levente (20/11/2026). NE PAS FUSIONNER.
 *
 * Jeu de données FICTIF, local à la démo : aucun nom, lieu, message ou
 * compteur réel. Les mêmes données servent aux deux rendus comparés :
 * - « avant » : le vrai `CircleV2` de main, nourri par le bouchon `fetch`
 *   (`bouchon.ts`) qui rend ces données sous la forme des routes du greffon ;
 * - « après » : la mise en page de démonstration (`DemoCercleLevente.svelte`).
 *
 * Seuls les champs que le greffon rend VRAIMENT existent ici : pas de photo,
 * pas de présence, pas d'abonnés, pas d'écoutes, pas de pochette de playlist.
 */

export interface MembreDemo { id: number; nom: string; ville: string; pays: string; lat: number; lon: number }

export const MOI: MembreDemo = { id: 1, nom: 'Sam Rivière', ville: 'Paris', pays: 'FR', lat: 48.9, lon: 2.4 };

export const MEMBRES: MembreDemo[] = [
  { id: 11, nom: 'Ines Duval', ville: 'Lyon', pays: 'FR', lat: 45.8, lon: 4.8 },
  { id: 12, nom: 'Tomas Novak', ville: 'Prague', pays: 'CZ', lat: 50.1, lon: 14.4 },
  { id: 13, nom: 'Mara Keller', ville: 'Berlin', pays: 'DE', lat: 52.5, lon: 13.4 },
  { id: 14, nom: 'Yuki Sato', ville: 'Montréal', pays: 'CA', lat: 45.5, lon: -73.6 },
  { id: 15, nom: 'Leo Brandt', ville: 'Budapest', pays: 'HU', lat: 47.5, lon: 19.0 },
  { id: 16, nom: 'Clara Rossi', ville: 'Barcelona', pays: 'ES', lat: 41.4, lon: 2.2 },
];

export interface CercleDemo { id: number; nom: string; membres: number[] }
export const CERCLES: CercleDemo[] = [
  { id: 101, nom: 'Listening club', membres: [11, 12, 13, 15] },
  { id: 102, nom: 'Jazz evenings', membres: [14, 16] },
];

export interface PlaylistDemo { id: number; nom: string; proprietaire: number; morceaux: number; cercle: number; maj: string; mine: boolean }
export const PLAYLISTS: PlaylistDemo[] = [
  { id: 201, nom: 'Sunday morning', proprietaire: 1, morceaux: 18, cercle: 101, maj: '2026-11-19T09:10:00Z', mine: true },
  { id: 202, nom: 'Late night jazz', proprietaire: 14, morceaux: 42, cercle: 102, maj: '2026-11-18T21:30:00Z', mine: false },
  { id: 203, nom: 'Field recordings', proprietaire: 13, morceaux: 24, cercle: 101, maj: '2026-11-17T15:00:00Z', mine: false },
  { id: 204, nom: 'Warm vinyl', proprietaire: 11, morceaux: 36, cercle: 101, maj: '2026-11-16T10:00:00Z', mine: false },
  { id: 205, nom: 'Focus & flow', proprietaire: 12, morceaux: 52, cercle: 101, maj: '2026-11-15T08:00:00Z', mine: false },
  { id: 206, nom: 'Road trip', proprietaire: 1, morceaux: 12, cercle: 102, maj: '2026-11-14T18:00:00Z', mine: true },
  { id: 207, nom: 'Piano only', proprietaire: 16, morceaux: 28, cercle: 102, maj: '2026-11-12T12:00:00Z', mine: false },
  { id: 208, nom: 'Club classics', proprietaire: 15, morceaux: 60, cercle: 101, maj: '2026-11-10T22:00:00Z', mine: false },
];

export interface MessageDemo { id: number; de: number; texte?: string; carte?: { type: 'album'; titre: string; artiste: string }; le: string }
export interface ConversationDemo { id: number; genre: 'direct' | 'circle'; avec: number; nonLus: number; messages: MessageDemo[] }

export const CONVERSATIONS: ConversationDemo[] = [
  { id: 301, genre: 'direct', avec: 11, nonLus: 1, messages: [
    { id: 1, de: 11, texte: 'Hi Sam!', le: '2026-11-20T09:24:00Z' },
    { id: 2, de: 11, texte: 'Have you heard the new album I mentioned? The last two tracks are wonderful.', le: '2026-11-20T09:25:00Z' },
    { id: 3, de: 1, texte: 'Not yet, it is on my list. Is it closer to electronic or ambient?', le: '2026-11-20T09:31:00Z' },
    { id: 4, de: 11, texte: 'A bit of both. Here it is:', le: '2026-11-20T09:32:00Z' },
    { id: 5, de: 11, carte: { type: 'album', titre: 'Slow Tides', artiste: 'Harbour Lights' }, le: '2026-11-20T09:32:30Z' },
    { id: 6, de: 11, texte: 'I also added a few tracks to our shared playlist.', le: '2026-11-20T09:33:00Z' },
    { id: 7, de: 1, texte: 'Thanks! I will listen this evening.', le: '2026-11-20T09:40:00Z' },
  ] },
  { id: 302, genre: 'direct', avec: 13, nonLus: 1, messages: [
    { id: 8, de: 13, texte: 'Added a few tracks to Field recordings.', le: '2026-11-20T08:50:00Z' },
  ] },
  { id: 303, genre: 'circle', avec: 101, nonLus: 0, messages: [
    { id: 9, de: 12, texte: 'New playlist for the weekend is up.', le: '2026-11-19T18:00:00Z' },
  ] },
  { id: 304, genre: 'direct', avec: 14, nonLus: 0, messages: [
    { id: 10, de: 14, carte: { type: 'album', titre: 'Blue Hours', artiste: 'Nora Lind Trio' }, le: '2026-11-18T20:00:00Z' },
    { id: 11, de: 14, texte: 'That concert recording is a gem.', le: '2026-11-18T20:01:00Z' },
  ] },
  { id: 305, genre: 'circle', avec: 102, nonLus: 0, messages: [
    { id: 12, de: 16, texte: 'Piano only is ready, enjoy.', le: '2026-11-17T19:00:00Z' },
  ] },
];

/** Les cartes de musique partagées dans la conversation ouverte (rail « Partagé dans cette conversation »). */
export const PARTAGES_FIL = [
  { titre: 'Slow Tides', artiste: 'Harbour Lights' },
  { titre: 'Paper Moons', artiste: 'Elm & Ash' },
  { titre: 'Northern Glass', artiste: 'Iris Vale' },
  { titre: 'Low Sun', artiste: 'The Quiet Hours' },
];

export interface NotifDemo { id: number; genre: 'contact_accepted' | 'playlist_shared'; acteur: number; playlist?: number; cercle?: string; le: string }
export const NOTIFS: NotifDemo[] = [
  { id: 401, genre: 'playlist_shared', acteur: 13, playlist: 203, cercle: 'Listening club', le: '2026-11-20T07:00:00Z' },
  { id: 402, genre: 'contact_accepted', acteur: 16, le: '2026-11-19T16:00:00Z' },
  { id: 403, genre: 'playlist_shared', acteur: 14, playlist: 202, cercle: 'Jazz evenings', le: '2026-11-18T21:30:00Z' },
];

export const nomDe = (id: number): string =>
  id === MOI.id ? MOI.nom : MEMBRES.find((m) => m.id === id)?.nom ?? CERCLES.find((c) => c.id === id)?.nom ?? '?';
