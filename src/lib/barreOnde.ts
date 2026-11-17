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
 * QOBUZ ET TIDAL (go de Bertrand du 17/11/2026, rc13 ; option C le soir
 * même) : SEULEMENT si le réglage « Forme d'onde des pistes de streaming »
 * (`ondeStreaming`, décoché par défaut) est coché — sinon aucune requête.
 * La piste en lecture n'a pas d'identifiant de bibliothèque ; son enveloppe
 * vient de `GET /library/service-tracks/{service}/{source_id}/waveform`. Le
 * serveur télécharge la piste pour l'analyser, une fois, et seulement après
 * 30 s de lecture (garde côté serveur) : il répond d'abord
 * `202 { pending: true }`, et la barre reste classique jusqu'à l'enveloppe,
 * redemandée toutes les quelques secondes ([`DELAI_REESSAI_MS`]).
 *
 * REPLI : pas d'enveloppe ⇒ la barre classique, sans message. C'est le cas
 *   - d'une radio, d'un podcast, d'un média UPnP, d'une piste Spotify ou
 *     YouTube… : aucune requête n'est même envoyée ;
 *   - d'une enveloppe en cours de calcul (le serveur décode tout le fichier à
 *     la première demande : 2 à 4 s pour une piste de 4 min, 40 à 60 s pour
 *     une piste d'une heure, mesuré sur le .18 le 12/11/2026) : la barre
 *     classique s'affiche jusqu'à la réponse ;
 *   - d'un refus DÉFINITIF (`waveform: null`, 404 ou autre 4xx) : retenu
 *     comme « pas d'onde » pour toute la session, JAMAIS redemandé ;
 *   - d'une panne PASSAGÈRE (réseau coupé, 5xx, 401, 408, 429, serveur qui
 *     redémarre) : barre classique, mais RIEN n'est retenu — la piste est
 *     redemandée au prochain passage (changement de piste, remontage).
 *     Mémoriser ces pannes figeait la barre classique pour la vie de
 *     l'onglet : Chrome resté ouvert pendant la mise à jour du .18 le
 *     16/11/2026 n'a plus montré l'onde, Safari rechargé si (Bertrand, 17/11).
 *
 * UNE requête par piste et par onglet : le cache garde la promesse dès
 * l'envoi, si bien que la barre du bas et l'écran de lecture qui demandent la
 * même piste au même instant partagent la même requête.
 */
import { derived, readable, type Readable } from 'svelte/store';
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

/** Les services dont le serveur sait calculer l'enveloppe de la piste en
 *  lecture (par téléchargement, `audio_de_service` côté serveur). */
export const SERVICES_ONDE: readonly string[] = ['qobuz', 'tidal'];

/** La clé d'une piste dont le serveur peut calculer l'enveloppe, ou `null` :
 *  l'identifiant de bibliothèque (un nombre) pour une piste locale, ou
 *  `"<service>:<source_id>"` pour une piste Qobuz ou TIDAL. */
export type ClePiste = number | string;

export function clePisteOnde(
  piste: Pick<NowPlaying, 'source' | 'track_id' | 'id' | 'source_id'> | null | undefined,
): ClePiste | null {
  if (!piste) return null;
  const locale = idPisteOnde(piste);
  if (locale !== null) return locale;
  const service = typeof piste.source === 'string' ? piste.source.trim().toLowerCase() : '';
  if (!SERVICES_ONDE.includes(service)) return null;
  const id = piste.source_id == null ? '' : String(piste.source_id).trim();
  return id ? `${service}:${id}` : null;
}

/** Le service et l'identifiant chez lui d'une clé de piste de service. */
export function pisteDeServiceDe(cle: ClePiste): { service: string; id: string } | null {
  if (typeof cle !== 'string') return null;
  const i = cle.indexOf(':');
  return i > 0 ? { service: cle.slice(0, i), id: cle.slice(i + 1) } : null;
}

/** Le serveur calcule encore (`202 { pending: true }`) : rien à retenir. */
export function enAttente(reponse: unknown): boolean {
  return (reponse as { pending?: unknown } | null)?.pending === true;
}

/** Délai entre deux demandes d'une enveloppe pas encore prête (ou d'une
 *  panne passagère), et nombre d'essais : cinq minutes — les 30 s de
 *  lecture qu'attend le serveur, puis son délai de téléchargement (3 min). */
export const DELAI_REESSAI_MS = 3000;
export const ESSAIS_MAX = 100;

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
  connue(id: ClePiste): Onde | null | undefined;
  /** Demande l'enveloppe — une seule fois par piste, quoi qu'il arrive. */
  obtenir(id: ClePiste): Promise<Onde | null>;
}

/** Un cache par piste, autour d'une fonction de chargement injectée (les
 *  tests passent la leur, l'application passe `api.getTrackWaveform`). */
/** Un échec de chargement est-il une réponse DÉFINITIVE du serveur (« cette
 *  piste n'a pas d'onde », à retenir) ou une panne PASSAGÈRE (à redemander) ?
 *
 *  Définitif : un statut 4xx que rejouer ne changerait pas (404 piste
 *  inconnue, 400, 422…) et le 501 (« je ne sais pas faire »). Passager :
 *  pas de statut du tout (réseau coupé, requête abandonnée), un 5xx (dont le
 *  503 du serveur qui démarre), 401 (session à rouvrir), 408 et 429. */
export function echecDefinitif(erreur: unknown): boolean {
  const statut = (erreur as { status?: unknown } | null)?.status;
  if (typeof statut !== 'number') return false;
  if (statut === 501) return true;
  return statut >= 400 && statut < 500 && statut !== 401 && statut !== 408 && statut !== 429;
}

export function creerCacheOndes(charger: (id: ClePiste) => Promise<unknown>): CacheOndes {
  const resolues = new Map<ClePiste, Onde | null>();
  const enVol = new Map<ClePiste, Promise<Onde | null>>();
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
        .then(
          // `pending` : le serveur calcule encore — pas une réponse.
          (reponse) => ({ onde: normaliserOnde(reponse), retenir: !enAttente(reponse) }),
          (erreur) => ({ onde: null, retenir: echecDefinitif(erreur) }),
        )
        .then(({ onde, retenir }) => {
          // Une panne passagère n'est PAS une réponse : rien de retenu, la
          // prochaine demande de cette piste repartira au serveur.
          if (retenir) resolues.set(id, onde);
          enVol.delete(id);
          return onde;
        });
      enVol.set(id, p);
      return p;
    },
  };
}

/** L'enveloppe de la piste en lecture, ou `null` (réglage décoché, piste sans
 *  enveloppe possible, calcul en cours, refus). Un SEUL abonnement pour les
 *  deux barres.
 *
 *  `actif` et `piste` sont réduits à une clé primitive avant d'atteindre la
 *  requête : les préférences changent à chaque pas de volume, la zone à chaque
 *  tic de position, et ni l'un ni l'autre ne doit relancer quoi que ce soit.
 *
 *  Une réponse qui n'est pas retenue par le cache (enveloppe en calcul côté
 *  serveur, panne passagère) est redemandée toutes les [`DELAI_REESSAI_MS`],
 *  au plus [`ESSAIS_MAX`] fois, tant que la piste ne change pas. Le
 *  remontage (nouvel abonné après le départ du dernier) redemande une piste
 *  restée inconnue du cache. */
export function ondeDeLaPiste(
  actif: Readable<boolean>,
  piste: Readable<Pick<NowPlaying, 'source' | 'track_id' | 'id' | 'source_id'> | null | undefined>,
  cache: CacheOndes,
  /** Réglage `ondeStreaming` : les pistes Qobuz et TIDAL aussi. Faux par
   *  défaut — une piste de service n'est alors jamais demandée. */
  services: Readable<boolean> = readable(false),
): Readable<Onde | null> {
  const cle = derived([actif, piste, services], ([$actif, $piste, $services]) => {
    if (!$actif) return null;
    const c = clePisteOnde($piste);
    return typeof c === 'string' && !$services ? null : c;
  });
  // `derived` sur un dérivé primitif ne se relance qu'au vrai changement de
  // valeur (ou à un nouvel abonnement) : les tics de position ne redemandent
  // rien.
  let jeton = 0;
  return derived(cle, ($cle, set) => {
    const moi = ++jeton;
    if ($cle == null) { set(null); return; }
    const connue = cache.connue($cle);
    if (connue !== undefined) { set(connue); return; }
    // Pas encore connue : la barre classique d'ici la réponse.
    set(null);
    let minuterie: ReturnType<typeof setTimeout> | null = null;
    let essais = 0;
    const demander = () => {
      minuterie = null;
      void cache.obtenir($cle).then((onde) => {
        // Une réponse arrivée après un changement de piste (ou un départ) n'a
        // plus rien à dire.
        if (moi !== jeton) return;
        if (onde === null && cache.connue($cle) === undefined) {
          if (essais++ < ESSAIS_MAX) minuterie = setTimeout(demander, DELAI_REESSAI_MS);
          return;
        }
        set(onde);
      });
    };
    demander();
    return () => {
      jeton++;
      if (minuterie !== null) clearTimeout(minuterie);
    };
  }, null as Onde | null);
}
