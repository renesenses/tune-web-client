/**
 * web#2209 (FabienM, fils 2302 point 6 et 2379 point 4) — « Menu historique :
 * sur la ligne d'un titre Qobuz, rendre actif le lien de la colonne Album pour
 * se rendre sur l'album Qobuz (sauf si radio ou podcast), et ajouter l'action
 * "Aller à l'album" dans les 3 petits points. » Go de Bertrand le 22/10.
 *
 * Le lien de la colonne Album et « Aller à l'album » existent déjà
 * (`lienAlbumDePiste`, `PisteActions.allerAlbum`), mais pour une piste de
 * service ils exigent l'identifiant de l'album CHEZ LE SERVICE
 * (`albumDeServiceDe`). L'Historique ne l'a que si l'écoute a été lancée
 * DEPUIS l'album (`album_id_service` tiré du contexte, fil 1906). Un titre
 * Qobuz lancé seul, depuis une recherche ou une playlist, n'en avait pas :
 * `album_id` de `/library/history` est une colonne de bibliothèque, `null`
 * pour toute piste de service. Le nom d'album restait du texte, et l'entrée
 * du menu était absente.
 *
 * Ce module va chercher cet identifiant là où il est sûr : la piste elle-même
 * chez son service (`GET /streaming/{service}/tracks/{source_id}`, un
 * `StreamTrack` qui porte `album_id`). Jamais par le titre de l'album : deux
 * albums peuvent porter le même nom (#1361).
 *
 * Bornes : seulement les services dont la piste désigne un album (pas la
 * radio, pas les podcasts, pas Bandcamp, qui a son propre chemin
 * `albumBandcampDuTitre`) ; une réponse mémorisée par piste pour la session,
 * trouvée ou non ; au plus `plafond` demandes par passage, `parallele` à la
 * fois.
 */
import type { HistoryEntry } from './stores/history';
import { albumDeServiceDe } from './routageAlbum';

/** Les services dont un titre désigne son album par `album_id`. */
export const SERVICES_A_ALBUM = ['qobuz', 'tidal', 'deezer', 'spotify', 'amazon'] as const;

type LirePiste = (service: string, id: string) => Promise<{ album_id?: unknown; artist_id?: unknown } | null | undefined>;

/** Réponses déjà obtenues, par `service:source_id` (album, artiste) ; `null` = rien. */
const memoire = new Map<string, { album: string; artiste: string | null } | null>();

/** Pour les témoins : repartir d'une mémoire vide. */
export function oublierAlbumsDesEcoutes(): void {
  memoire.clear();
}

const cle = (t: any) => `${t.source}:${t.source_id}`;

/** Cette écoute demande-t-elle l'album à son service ? */
export function albumAResoudre(t: any): boolean {
  if (!t || !(SERVICES_A_ALBUM as readonly string[]).includes(t.source)) return false;
  if (t.source_id == null || String(t.source_id).trim() === '') return false;
  if (!(typeof t.album_title === 'string' && t.album_title.trim())) return false;
  return albumDeServiceDe(t) == null;
}

function texte(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function completer(t: any): any {
  const r = memoire.get(cle(t));
  if (!r) return t;
  return {
    ...t,
    album_id_service: r.album,
    // L'artiste chez le service, s'il manque : la fiche d'album le montre.
    artist_id: t.artist_id ?? r.artiste,
  };
}

/**
 * Les écoutes, avec l'album de service de celles qui n'en avaient pas.
 * `null` quand rien n'a changé (l'appelant garde son tableau).
 */
export async function completerAlbumsDeService(
  entrees: readonly HistoryEntry[],
  lire: LirePiste,
  { plafond = 40, parallele = 3 }: { plafond?: number; parallele?: number } = {},
): Promise<HistoryEntry[] | null> {
  const aDemander: { service: string; id: string; k: string }[] = [];
  const vues = new Set<string>();
  for (const e of entrees) {
    const t = e.track as any;
    if (!albumAResoudre(t)) continue;
    const k = cle(t);
    if (memoire.has(k) || vues.has(k)) continue;
    vues.add(k);
    if (aDemander.length < plafond) aDemander.push({ service: t.source, id: String(t.source_id), k });
  }
  let i = 0;
  const ouvrier = async () => {
    while (i < aDemander.length) {
      const d = aDemander[i++];
      try {
        const st = await lire(d.service, d.id);
        const album = texte(st?.album_id);
        memoire.set(d.k, album ? { album, artiste: texte(st?.artist_id) } : null);
      } catch {
        // Un service qui ne répond pas n'est pas une piste sans album : on
        // ne mémorise pas l'échec, le prochain passage redemandera.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallele, aDemander.length) }, ouvrier));

  let change = false;
  const sortie = entrees.map((e) => {
    if (!albumAResoudre(e.track)) return e;
    const t = completer(e.track);
    if (t === e.track) return e;
    change = true;
    return { ...e, track: t };
  });
  return change ? sortie : null;
}
