/**
 * BARRE DE PROGRESSION EN FORME D'ONDE — tune-server-rust Discussion #8269,
 * go de Bertrand du 12/11/2026 (rc12) ; redemandée sur le forum (fil 2775).
 *
 * Réglage `barreOnde` (Réglages › Interface), DÉCOCHÉ par défaut : l'écran de
 * qui n'a rien demandé ne bouge pas d'un pixel (la règle de #1428).
 *
 * Coché, la barre de progression de « Lecture en cours » et celle de la barre
 * de lecture du bas dessinent l'enveloppe de la piste. La barre reste le MÊME
 * élément `role="slider"` : clic, glissé, clavier et ARIA ne changent pas, seul
 * le dessin de l'intérieur change.
 *
 * La donnée vient de `GET /library/tracks/{id}/waveform` (serveur, enveloppe
 * RMS normalisée, 200 points, mise en cache en base). ⚠️ À ne pas confondre
 * avec `api.getWaveform`, qui vise `/dj/waveform/{id}` — la route du greffon DJ.
 *
 * REPLI : pas d'enveloppe ⇒ la barre classique, sans message. C'est le cas
 *   - d'une piste qui n'est pas un fichier local (Qobuz, TIDAL, radio, UPnP,
 *     YouTube…) : aucune requête n'est même envoyée ;
 *   - d'une enveloppe en cours de calcul (le serveur décode tout le fichier à
 *     la première demande : 2 à 4 s pour une piste de 4 min, 40 à 60 s pour
 *     une piste d'une heure, mesuré sur le .18 le 12/11/2026) : la barre
 *     classique s'affiche jusqu'à la réponse ;
 *   - d'un refus (`waveform: null`, 404, panne réseau) : retenu comme « pas
 *     d'onde » pour toute la session, JAMAIS redemandé.
 *
 * UNE requête par piste et par onglet : le cache garde la promesse dès
 * l'envoi, si bien que la barre du bas et l'écran de lecture qui demandent la
 * même piste au même instant partagent la même requête.
 */
import { derived, type Readable } from 'svelte/store';
import type { NowPlaying } from './types';

/** Points d'enveloppe, chacun dans [0, 1]. */
export type Onde = number[];

/** L'identifiant de bibliothèque d'une piste dont le serveur peut calculer
 *  l'enveloppe, ou `null`.
 *
 *  Seule une piste `local` a un fichier : une piste de service (Qobuz, TIDAL),
 *  une radio ou un média UPnP n'a pas de `file_path`, et la demander coûterait
 *  une requête pour s'entendre répondre « no file path ». Le serveur nomme l'id
 *  `track_id` sur `/zones` et `id` sur `/zones/{id}/state` (voir `NowPlaying`). */
export function idPisteOnde(
  piste: Pick<NowPlaying, 'source' | 'track_id' | 'id'> | null | undefined,
): number | null {
  if (!piste || piste.source !== 'local') return null;
  const id = piste.track_id ?? piste.id ?? null;
  return typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null;
}

/** La réponse du serveur, réduite à une enveloppe dessinable, ou `null`.
 *
 *  Tout ce qui n'est pas un tableau d'au moins deux nombres finis est un
 *  « pas d'onde » : un `waveform: null` (« no file path », « file unreadable »),
 *  un corps inattendu, un tableau vide. Les valeurs sont bornées à [0, 1] —
 *  le serveur normalise déjà, mais une valeur folle ne doit pas sortir du
 *  cadre. */
export function normaliserOnde(reponse: unknown): Onde | null {
  const brut = (reponse as { waveform?: unknown } | null)?.waveform;
  if (!Array.isArray(brut) || brut.length < 2) return null;
  const points: number[] = [];
  for (const v of brut) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    points.push(Math.max(0, Math.min(1, v)));
  }
  // Une enveloppe toute plate (silence, ou fichier mal décodé) ne dit rien de
  // la piste : la barre classique est plus honnête.
  return points.some((v) => v > 0) ? points : null;
}

/** Réduit l'enveloppe à `n` barres, par le MAXIMUM de chaque tranche — une
 *  moyenne effacerait les attaques, qui sont justement ce qu'on cherche à voir
 *  sur la barre. `n` au moins égal au nombre de points : rendue telle quelle. */
export function reduireOnde(points: Onde, n: number): Onde {
  const cible = Math.max(1, Math.floor(n));
  if (cible >= points.length) return points;
  const sortie: number[] = [];
  for (let i = 0; i < cible; i++) {
    const debut = Math.floor((i * points.length) / cible);
    const fin = Math.max(debut + 1, Math.floor(((i + 1) * points.length) / cible));
    let max = 0;
    for (let j = debut; j < fin; j++) if (points[j] > max) max = points[j];
    sortie.push(max);
  }
  return sortie;
}

/** Combien de barres pour une largeur donnée : une barre pour 3 px (2 px de
 *  trait, 1 px de jour), entre 24 et le nombre de points du serveur. À 400 px
 *  de large (mobile), la barre en garde une centaine. */
export function nombreDeBarres(largeurPx: number, nbPoints: number): number {
  if (!Number.isFinite(largeurPx) || largeurPx <= 0) return Math.min(nbPoints, 100);
  return Math.max(Math.min(24, nbPoints), Math.min(nbPoints, Math.floor(largeurPx / 3)));
}

/** Le chemin SVG des barres, dans un repère `0 0 n 100` : une barre centrée
 *  verticalement par point, de hauteur proportionnelle (6 % au minimum, pour
 *  que les silences restent un trait visible et non un trou). */
export function cheminOnde(points: Onde): string {
  const n = points.length;
  if (n === 0) return '';
  const largeur = 0.66;
  const marge = (1 - largeur) / 2;
  let d = '';
  for (let i = 0; i < n; i++) {
    const h = Math.max(6, Math.min(100, points[i] * 100));
    const y = (100 - h) / 2;
    d += `M${(i + marge).toFixed(2)} ${y.toFixed(2)}h${largeur}v${h.toFixed(2)}h${-largeur}z`;
  }
  return d;
}

/** La position visée par une touche sur le curseur de progression, ou `null`
 *  si la touche n'est pas pour lui.
 *
 *  ← / → : 10 s, le même pas que le raccourci global de l'écran de lecture
 *  (`keyboard.ts`) — deux pas différents pour la même flèche selon l'endroit
 *  du focus se liraient comme un défaut. Début / Fin : les bornes.
 *  ↑ / ↓ ne sont PAS prises : sur l'écran de lecture elles règlent le volume,
 *  et un focus resté sur la barre ne doit pas leur ôter ce sens. */
export function cibleClavier(touche: string, positionMs: number, dureeMs: number): number | null {
  if (!dureeMs || dureeMs <= 0) return null;
  const PAS = 10_000;
  switch (touche) {
    case 'ArrowRight':
      return Math.min(dureeMs, Math.max(0, positionMs) + PAS);
    case 'ArrowLeft':
      return Math.max(0, Math.min(dureeMs, positionMs) - PAS);
    case 'Home':
      return 0;
    case 'End':
      // Pas la toute dernière milliseconde : un seek au-delà de la fin fait
      // sauter certains renderers à la piste suivante sans rien jouer.
      return Math.max(0, dureeMs - 1000);
    default:
      return null;
  }
}

export interface CacheOndes {
  /** L'enveloppe si elle est déjà connue (`null` : connue comme absente),
   *  `undefined` si elle n'a jamais été demandée ou est en route. */
  connue(id: number): Onde | null | undefined;
  /** Demande l'enveloppe — une seule fois par piste, quoi qu'il arrive. */
  obtenir(id: number): Promise<Onde | null>;
}

/** Un cache par piste, autour d'une fonction de chargement injectée (les
 *  tests passent la leur, l'application passe `api.getTrackWaveform`). */
export function creerCacheOndes(charger: (id: number) => Promise<unknown>): CacheOndes {
  const resolues = new Map<number, Onde | null>();
  const enVol = new Map<number, Promise<Onde | null>>();
  return {
    connue(id) {
      return resolues.has(id) ? resolues.get(id)! : undefined;
    },
    obtenir(id) {
      if (resolues.has(id)) return Promise.resolve(resolues.get(id)!);
      const deja = enVol.get(id);
      if (deja) return deja;
      const p = Promise.resolve()
        .then(() => charger(id))
        .then(normaliserOnde, () => null)
        .then((onde) => {
          resolues.set(id, onde);
          enVol.delete(id);
          return onde;
        });
      enVol.set(id, p);
      return p;
    },
  };
}

/** L'enveloppe de la piste en lecture, ou `null` (réglage décoché, piste sans
 *  fichier, calcul en cours, refus). Un SEUL abonnement pour les deux barres.
 *
 *  `actif` et `piste` sont réduits à des primitives avant d'atteindre la
 *  requête : les préférences changent à chaque pas de volume, la zone à chaque
 *  tic de position, et ni l'un ni l'autre ne doit relancer quoi que ce soit. */
export function ondeDeLaPiste(
  actif: Readable<boolean>,
  piste: Readable<Pick<NowPlaying, 'source' | 'track_id' | 'id'> | null | undefined>,
  cache: CacheOndes,
): Readable<Onde | null> {
  const id = derived([actif, piste], ([$actif, $piste]) => ($actif ? idPisteOnde($piste) : null));
  // `derived` sur un dérivé primitif ne se relance qu'au vrai changement de
  // valeur : un même id ne redemande rien, et le cache ferait barrage sinon.
  let dernier: number | null | undefined;
  let jeton = 0;
  let valeur: Onde | null = null;
  return derived(id, ($id, set) => {
    if ($id === dernier) { set(valeur); return; }
    dernier = $id;
    const moi = ++jeton;
    if ($id == null) { valeur = null; set(null); return; }
    const connue = cache.connue($id);
    if (connue !== undefined) { valeur = connue; set(connue); return; }
    // En route : la barre classique d'ici la réponse.
    valeur = null;
    set(null);
    void cache.obtenir($id).then((onde) => {
      // Une réponse arrivée après un changement de piste n'a plus rien à dire.
      if (moi !== jeton) return;
      valeur = onde;
      set(onde);
    });
  }, null as Onde | null);
}
