/**
 * Recherche : fusion des résultats par TYPE et choix du meilleur résultat.
 *
 * ## Par type, jamais par source
 *
 * Bertrand a tranché il y a longtemps : on regroupe par artiste / album /
 * titre, pas par « local » / « Qobuz » / « Tidal ». Chercher « Kind of Blue »
 * c'est chercher un disque, pas chercher chez un marchand ; l'ancienne mise en
 * page à plat par source « faisait bof ». Le nouveau client était reparti sur
 * un bloc « Sur les services » séparé des sections locales — c'est-à-dire
 * exactement le découpage par source qu'on avait écarté (signalé le
 * 05/09/2026 : « écran incomplet par rapport à v0 »).
 *
 * La provenance ne disparaît pas pour autant : chaque ligne garde sa `source`,
 * et la vignette porte son badge de service.
 *
 * ## Le meilleur résultat
 *
 * Un point focal, à gauche, avec une grande image. Le barème est celui du
 * client actuel, repris tel quel pour que les deux écrans ne classent pas
 * différemment la même requête.
 */

import type { Album, Artist, SearchResult, Track } from './types';

/** Une ligne de résultat sait toujours d'où elle vient. */
export type AvecSource<T> = T & { source?: string | null };

export interface ResultatsFusionnes {
  artistes: AvecSource<Artist>[];
  albums: AvecSource<Album>[];
  pistes: AvecSource<Track>[];
}

/**
 * Rassemble le local et chaque service dans UNE liste par type.
 *
 * Le local passe devant : c'est ce que l'utilisateur possède déjà, et le lui
 * proposer après une offre marchande serait absurde.
 */
export function fusionnerParType(
  local: SearchResult | null,
  services: Record<string, SearchResult>,
): ResultatsFusionnes {
  const marquer = <T,>(rows: readonly T[] | undefined, source: string): AvecSource<T>[] =>
    (rows ?? []).map((r) => ({ ...(r as any), source: (r as any).source ?? source }));

  const artistes = [...marquer(local?.artists, 'local')];
  const albums = [...marquer(local?.albums, 'local')];
  const pistes = [...marquer(local?.tracks, 'local')];

  for (const [svc, r] of Object.entries(services ?? {})) {
    artistes.push(...marquer(r?.artists, svc));
    albums.push(...marquer(r?.albums, svc));
    pistes.push(...marquer(r?.tracks, svc));
  }
  return { artistes, albums, pistes };
}

export type Meilleur =
  | { genre: 'artiste'; artiste: AvecSource<Artist> }
  | { genre: 'album'; album: AvecSource<Album> }
  | { genre: 'piste'; piste: AvecSource<Track> };

/**
 * Ce que vaut une SOURCE, à texte égal.
 *
 * 🔴 `renesenses/tune-web-client#850` — FabienM, fil 1749. Le barème ne
 * connaît ni source ni notoriété : « 100 points pour un titre exactement égal
 * à la requête ». Sur une requête ordinaire, une dizaine de lignes atteignent
 * donc le même score, et la boucle garde la PREMIÈRE (`s > best`). C'est
 * l'ordre d'arrivée qui tranche — et il est alphabétique par accident, le
 * serveur sérialisant ses services depuis un `BTreeMap` (#856).
 *
 * MESURÉ le 12/09/2026 sur la .18, dix requêtes réelles :
 *
 *   9 sur 10 ont un meilleur résultat décidé par ÉGALITÉ
 *   « air » : 8 ex æquo · « miles davis » : 6 · « daft punk » : 5
 *
 * Et l'ordre alphabétique met en tête le service qui rend le MOINS :
 *
 *   tidal    rang 3,0 — 320 résultats      bandcamp  rang 1,0 — 143
 *   qobuz    rang 2,0 — 319                youtube   rang 4,0 —  30
 *
 * Le départage vaut donc bien plus que quelques points : c'est lui qui décide
 * presque toujours. On le rend EXPLICITE.
 *
 * Le local passe devant — c'est ce que l'utilisateur possède déjà, et le lui
 * proposer après une offre marchande serait absurde (même raison que
 * `fusionnerParType`). Les services suivent dans un ordre assumé, et non plus
 * celui de leurs initiales. Une source inconnue ne tombe pas à zéro : elle
 * vaut moins que celles qu'on connaît, jamais moins que rien.
 */
const RANG_SOURCE: Record<string, number> = {
  local: 5,
  qobuz: 4,
  tidal: 3,
  deezer: 2,
  bandcamp: 1,
  youtube: 0,
};

/** Le petit bonus de source, à texte égal. Jamais assez pour battre un texte. */
export function bonusSource(source: string | null | undefined): number {
  const r = RANG_SOURCE[(source ?? '').toLowerCase()];
  return r == null ? 0.5 : r;
}

/** Barème commun aux trois types : égalité 100, préfixe 50, contenu 20. */
function scoreTexte(valeur: string | null | undefined, q: string): number {
  const v = (valeur ?? '').toLowerCase();
  if (!v) return 0;
  if (v === q) return 100;
  if (v.startsWith(q)) return 50;
  if (v.includes(q)) return 20;
  return 0;
}

/**
 * Le résultat à mettre en avant, ou `null` si rien ne correspond.
 *
 * Un artiste avec portrait est bonifié (+30) : c'est la carte qui a le plus à
 * gagner d'une grande image, et sans portrait elle ne montrerait qu'une
 * initiale. Un album avec pochette prend +5, de quoi départager deux titres
 * identiques sans écraser le score de texte.
 */
export function meilleurResultat(
  requete: string,
  r: ResultatsFusionnes,
): Meilleur | null {
  const q = requete.trim().toLowerCase();
  if (!q) return null;

  const candidats: { score: number; valeur: Meilleur }[] = [];

  let best = 0;
  let gagnant: Meilleur | null = null;
  for (const a of r.artistes) {
    const s = scoreTexte(a.name, q) + (a.image_path ? 30 : 0) + bonusSource(a.source);
    if (s > 0 && s > best) { best = s; gagnant = { genre: 'artiste', artiste: a }; }
  }
  if (gagnant) candidats.push({ score: best, valeur: gagnant });

  best = 0; gagnant = null;
  for (const a of r.albums) {
    const s = scoreTexte(a.title, q) + (a.cover_path ? 5 : 0) + bonusSource(a.source);
    if (s > 0 && s > best) { best = s; gagnant = { genre: 'album', album: a }; }
  }
  if (gagnant) candidats.push({ score: best, valeur: gagnant });

  best = 0; gagnant = null;
  for (const t of r.pistes) {
    const s = scoreTexte(t.title, q) + bonusSource(t.source);
    if (s > 0 && s > best) { best = s; gagnant = { genre: 'piste', piste: t }; }
  }
  if (gagnant) candidats.push({ score: best, valeur: gagnant });

  candidats.sort((a, b) => b.score - a.score);
  if (candidats.length) return candidats[0].valeur;

  // Rien ne correspond au texte — le serveur a pourtant rendu quelque chose
  // (recherche floue, correspondance sur l'artiste d'un album…). Mieux vaut
  // proposer la première ligne que rien du tout.
  if (r.artistes.length) return { genre: 'artiste', artiste: r.artistes[0] };
  if (r.albums.length) return { genre: 'album', album: r.albums[0] };
  if (r.pistes.length) return { genre: 'piste', piste: r.pistes[0] };
  return null;
}

/* ------------------------------------------------------------------ */
/* Recherches récentes                                                 */
/* ------------------------------------------------------------------ */

const CLE_RECENTES = 'tune_search_history';
const RECENTES_MAX = 10;

export interface RechercheRecente { query: string; timestamp: number }

export function chargerRecherchesRecentes(): RechercheRecente[] {
  try {
    const brut = localStorage.getItem(CLE_RECENTES);
    if (brut) return JSON.parse(brut) as RechercheRecente[];
  } catch { /* ignore */ }
  return [];
}

function ecrire(entrees: RechercheRecente[]) {
  try { localStorage.setItem(CLE_RECENTES, JSON.stringify(entrees)); } catch { /* ignore */ }
}

/** Ajoute une requête en tête, sans doublon insensible à la casse. */
/**
 * Une frappe PROLONGE-t-elle la recherche qu'on vient de retenir ?
 *
 * 🔴 `renesenses/tune-web-client#881` — l'historique était écrit à chaque état
 * de frappe, pas à la validation : « dix entrées pour deux recherches, et il
 * est plafonné à dix ». Taper « miles davis » en marquant une pause laissait
 * « mi », « miles », « miles dav », « miles davis » — et les quatre chassaient
 * les vraies recherches d'avant hors du plafond.
 *
 * L'écran n'a pas de bouton « chercher » : il cherche pendant qu'on tape. On
 * ne peut donc pas attendre une validation qui n'existe pas. Ce qu'on PEUT
 * reconnaître, c'est la frappe elle-même — une saisie qui prolonge la
 * précédente est la MÊME recherche, en cours d'écriture.
 *
 * Exporté pour être éprouvé, et parce que la règle mérite d'être lisible
 * ailleurs que dans le corps de `retenirRecherche`.
 */
export function prolonge(precedente: string, nouvelle: string): boolean {
  const a = precedente.trim().toLowerCase();
  const b = nouvelle.trim().toLowerCase();
  if (!a || !b || a === b) return false;
  // « mile » → « miles » : on écrit. « miles » → « mile » : on efface. Les
  // deux sont la même recherche en cours, dans un sens ou dans l'autre.
  return b.startsWith(a) || a.startsWith(b);
}

/**
 * Retient une recherche.
 *
 * 🔴 #881 — une frappe qui PROLONGE la précédente la REMPLACE au lieu de
 * s'ajouter. Le plafond ne se remplit donc plus de brouillons, et l'entrée
 * gardée est la plus complète des deux : c'est celle que l'utilisateur a fini
 * d'écrire.
 *
 * ⚠️ Deux recherches VRAIMENT différentes restent deux entrées, même tapées
 * coup sur coup : « miles » puis « coltrane » ne se confondent pas.
 */
export function retenirRecherche(query: string): RechercheRecente[] {
  const q = query.trim();
  if (!q) return chargerRecherchesRecentes();
  const avant = chargerRecherchesRecentes();
  const entrees = avant.filter((e, i) => {
    if (e.query.toLowerCase() === q.toLowerCase()) return false;
    // Seule la PREMIÈRE — la plus récente — peut être un brouillon de
    // celle-ci. Écarter les suivantes effacerait de vraies recherches
    // anciennes qui partagent un préfixe.
    return !(i === 0 && prolonge(e.query, q));
  });
  entrees.unshift({ query: q, timestamp: Date.now() });
  const coupe = entrees.slice(0, RECENTES_MAX);
  ecrire(coupe);
  return coupe;
}

export function oublierRecherche(query: string): RechercheRecente[] {
  const entrees = chargerRecherchesRecentes().filter((e) => e.query !== query);
  ecrire(entrees);
  return entrees;
}

export function viderRecherchesRecentes(): RechercheRecente[] {
  ecrire([]);
  return [];
}
