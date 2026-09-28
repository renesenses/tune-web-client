/**
 * LA POSITION VIVANTE DE *CHAQUE* ZONE — #1711.
 *
 * JeromeQ, fil 2011, 28/09/2026 : sur la carte de zone de la première ligne de
 * l'Accueil, « le temps reste à 0:00 et la barre vide » pendant que la musique
 * joue (capture : Steely Dan, FLAC 192/24, zone Eversolo DMP-A6).
 *
 * ## Pourquoi c'était figé
 *
 * 🔴 Rien, dans le client, ne suivait la position d'une zone AUTRE que la zone
 * courante. `v2Live.suivreProgression` commence par `get(currentZoneId)` et
 * rend la main si la zone n'est pas celle-là ; le minuteur qu'elle arme écrit
 * dans `seekPositionMs`, **un seul nombre pour toute l'application**. C'est
 * juste tant qu'un seul lecteur est à l'écran — ce fut vrai jusqu'au 27/09.
 *
 * La première ligne a changé cela : elle montre TOUTES les zones qui jouent.
 * Leurs cartes lisaient `zone.position_ms`, qui ne bouge qu'à l'arrivée d'un
 * `zone.updated` — en pratique, au changement de piste. La valeur affichée
 * était donc celle du début du morceau, et elle y restait.
 *
 * ## Ce que fait ce magasin
 *
 * Il ancre, puis il compte. À chaque relève du serveur il reprend
 * `position_ms` tel quel ; entre deux relèves il ajoute le temps écoulé, une
 * fois par seconde, pour les seules zones dont l'état est `playing`.
 *
 * Trois règles, et chacune répare un défaut connu de cet écran :
 *
 * 1. **Le changement de piste remet à zéro.** La clé de piste vient de
 *    `clePisteEnCours` — la même que la barre de lecture. Sans elle on
 *    afficherait la position de l'ancien morceau sur le nouveau (#954 : « la
 *    barre montrait 68 s sur un titre qui venait de commencer »).
 * 2. **Une zone à l'arrêt ne compte pas**, et une zone qui s'arrête garde sa
 *    dernière position au lieu de continuer à avancer toute seule.
 * 3. **Le minuteur ne tourne que s'il a quelque chose à compter.** Aucune zone
 *    en lecture ⇒ aucun `setInterval` : un minuteur oublié tourne pour la vie
 *    de la page, et l'Accueil est un écran qu'on laisse ouvert.
 *
 * ## Pourquoi pas `seekPositionMs`
 *
 * Parce qu'il ne sait parler que d'UNE zone, par construction, et qu'il porte
 * en plus le déplacement manuel (`playback.seek`). Le brancher ici ferait
 * deux sources pour un même fait, et « deux règles pour un même fait finissent
 * par diverger » est déjà écrit ailleurs dans ce dépôt. La carte lit ce
 * magasin pour toutes ses zones, la zone courante comprise.
 */
import { readable } from 'svelte/store';
import { zones } from './stores/zones';
import { clePisteEnCours } from './positionLecture';

/** Le pas du compteur. Une seconde : c'est la résolution de ce qui est écrit. */
export const PAS_MS = 1000;

interface Ancre {
  /** La piste à laquelle la position se rapporte. */
  cle: string | null;
  /** La position annoncée par le serveur à la dernière relève, en ms. */
  base: number;
  /** L'instant de cette relève, sur l'horloge locale. */
  depuis: number;
  /** La zone joue-t-elle ? Une zone en pause ne compte pas. */
  joue: boolean;
  /** Durée annoncée, pour ne jamais dépasser la fin. `0` = inconnue. */
  duree: number;
}

/**
 * Où en est chaque zone, maintenant.
 *
 * Fonction pure : les témoins l'appellent avec leur propre horloge, sans
 * minuteur ni magasin. C'est ici qu'est la règle ; le magasin ci-dessous ne
 * fait que la cadencer.
 */
export function positionMaintenant(a: Ancre, maintenantMs: number): number {
  if (!a.joue) return a.base;
  const avance = a.base + Math.max(0, maintenantMs - a.depuis);
  // Borné à la durée : sur un flux dont la durée annoncée est fausse — ou une
  // piste qui s'achève pendant que le serveur se tait — le compteur partirait
  // au-delà de la fin et la barre déborderait de sa boîte.
  return a.duree > 0 ? Math.min(avance, a.duree) : avance;
}

/**
 * Relève : ce que le serveur vient de dire, comparé à ce qu'on savait.
 *
 * Rend la nouvelle ancre. La position du serveur est reprise TELLE QUELLE —
 * c'est lui qui fait autorité, l'interpolation ne sert qu'à combler le silence
 * entre deux de ses messages.
 */
export function ancrerDepuisZone(
  precedente: Ancre | undefined,
  zone: { state?: string; position_ms?: number; current_track?: unknown },
  maintenantMs: number,
): Ancre {
  const cle = clePisteEnCours(zone as any);
  const joue = zone?.state === 'playing';
  const piste = (zone as any)?.current_track ?? null;
  const duree = Number(piste?.duration_ms ?? 0) || 0;
  const annoncee = Math.max(0, Number(zone?.position_ms ?? 0) || 0);

  // Piste différente : on repart de ce que le serveur annonce, sans traîner
  // l'avance accumulée sur le morceau précédent.
  if (!precedente || precedente.cle !== cle) {
    return { cle, base: annoncee, depuis: maintenantMs, joue, duree };
  }
  // Même piste : toute relève ré-ancre. Le serveur a le dernier mot, y compris
  // quand il annonce un RECUL — c'est ce qui arrive après un déplacement fait
  // depuis un autre client, et l'ignorer laisserait la carte en avance.
  return { cle, base: annoncee, depuis: maintenantMs, joue, duree };
}

type Table = Record<number, number>;

/**
 * `{ identifiant de zone → position en ms }`, rafraîchi chaque seconde.
 *
 * `readable` : le minuteur naît au premier abonnement et meurt au dernier.
 * Personne n'affiche de zone ⇒ rien ne tourne.
 */
export const positionsZones = readable<Table>({}, (set) => {
  const ancres = new Map<number, Ancre>();
  let minuteur: ReturnType<typeof setInterval> | null = null;

  const publier = () => {
    const t: Table = {};
    const maintenant = Date.now();
    for (const [id, a] of ancres) t[id] = positionMaintenant(a, maintenant);
    set(t);
  };

  const cadencer = () => {
    const ilFautCompter = [...ancres.values()].some((a) => a.joue);
    if (ilFautCompter && minuteur == null) {
      minuteur = setInterval(publier, PAS_MS);
    } else if (!ilFautCompter && minuteur != null) {
      clearInterval(minuteur);
      minuteur = null;
    }
  };

  const desabonner = zones.subscribe((liste) => {
    const maintenant = Date.now();
    const vues = new Set<number>();
    for (const z of liste ?? []) {
      const id = (z as any)?.id;
      if (typeof id !== 'number') continue;
      vues.add(id);
      ancres.set(id, ancrerDepuisZone(ancres.get(id), z as any, maintenant));
    }
    // Une zone disparue de la liste ne doit pas garder sa place : sa carte
    // n'existe plus, et son ancre ferait tourner le minuteur pour rien.
    for (const id of [...ancres.keys()]) if (!vues.has(id)) ancres.delete(id);
    publier();
    cadencer();
  });

  return () => {
    desabonner();
    if (minuteur != null) clearInterval(minuteur);
    minuteur = null;
  };
});
