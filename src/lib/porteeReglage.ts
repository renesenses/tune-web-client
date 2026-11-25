/**
 * Le réglage d'égaliseur a-t-il atteint le son ? (tune-server-rust#4680)
 *
 * `applied_live: false` voulait dire trois choses : rien ne joue, la piste
 * suivante… ou une zone réseau dont le flux est relancé dans l'instant. Les
 * écrans traduisaient tout « prendra effet à la piste suivante » — faux sur
 * un Eversolo en DLNA, où l'effet s'entend aussitôt (recette v0.9.161).
 *
 * Le serveur dit désormais QUAND (`portee`). On le lit d'abord ; sans lui
 * (serveur antérieur), on retombe sur `applied_live` tel quel.
 *
 * Rend `true` (entendu, ou dans l'instant), `false` (piste suivante
 * seulement) ou `undefined` (rien à annoncer : rien ne joue, ou le serveur
 * ne dit rien).
 */
export type PorteeDuReglage = 'immediate' | 'restart' | 'next_track' | 'not_playing';

export function atteintLeSon(
  appliedLive: boolean | null | undefined,
  portee: string | null | undefined,
): boolean | undefined {
  if (portee === 'immediate' || portee === 'restart') return true;
  if (portee === 'next_track') return false;
  if (portee === 'not_playing') return undefined;
  return appliedLive ?? undefined;
}

/**
 * rc14 (retour de Rémi sur la rc13.90) — « Prendra effet à la piste
 * suivante » ne se dit qu'UNE fois pour toute la chaîne TESS, et non une fois
 * par greffon : chaque écran de greffon (égaliseur, crossfeed, Crossfeed Pro,
 * Crosstalk, profileur) avait son propre drapeau, et une même modification
 * de chaîne faisait répéter l'avis écran après écran.
 *
 * Le drapeau est commun : le premier écran qui constate « piste suivante »
 * en lecture prévient ; les suivants se taisent, jusqu'à ce qu'un réglage
 * atteigne de nouveau le son (`atteint === true`), qui le réarme.
 */
let avisPisteSuivanteDonne = false;
/** La zone pour laquelle l'avis a été donné : changer de zone le réarme. */
let zoneDeLAvis: number | null = null;

export function prevenirPisteSuivanteUneFois(
  atteint: boolean | undefined,
  enLecture: boolean,
  prevenir: () => void,
  zoneId: number | null | undefined = null,
): void {
  // Relecture de #3432 — une autre zone est une autre chaîne : l'avis donné
  // pour la précédente ne vaut pas pour elle.
  if ((zoneId ?? null) !== zoneDeLAvis) {
    avisPisteSuivanteDonne = false;
    zoneDeLAvis = zoneId ?? null;
  }
  if (atteint === false && enLecture) {
    if (!avisPisteSuivanteDonne) {
      avisPisteSuivanteDonne = true;
      prevenir();
    }
  } else if (atteint === true) {
    avisPisteSuivanteDonne = false;
  }
}

/** Réarme l'avis (témoins). */
export function rearmerAvisPisteSuivante(): void {
  avisPisteSuivanteDonne = false;
  zoneDeLAvis = null;
}
