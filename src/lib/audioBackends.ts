/**
 * Le sélecteur « Backend audio » lit la liste du serveur, il ne la devine plus
 * (#1268).
 *
 * Défaut d'origine : les trois `<option>` — Auto / WASAPI / ASIO — étaient
 * écrites EN DUR dans `SettingsView`. Deux technologies Windows, proposées
 * telles quelles à Lapinou sous Debian, puis à Benjithom sous Fedora en
 * 0.9.94. Choisir « ASIO » sur une machine Linux n'a jamais rien changé : la
 * lecture repartait sur le host par défaut de la plateforme, et l'écran
 * continuait d'afficher un réglage qui n'existait pas.
 *
 * Le serveur publie désormais la vérité dans `GET /system/config`, sous
 * `supported_audio_backends`, calculée par SA plateforme :
 *
 *   Windows + ASIO : auto « Auto (WASAPI) », wasapi « WASAPI », asio « ASIO (bit-perfect) »
 *   Windows        : auto « Auto (WASAPI) », wasapi « WASAPI »
 *   macOS          : auto « Auto (CoreAudio) »
 *   Linux          : auto « Auto (ALSA) »
 *
 * (`tune-core/src/outputs/local.rs::supported_backends`, verrouillé côté
 * serveur par `les_backends_audio_proposes_suivent_la_plateforme_du_serveur`.)
 *
 * Les libellés sont des NOMS PROPRES et ne se traduisent pas — sauf le mot
 * « Auto », rendu dans la langue de l'interface par {@link libelleBackend}.
 *
 * Module PUR : il reçoit la config et sa fonction de traduction, pour être
 * testable sans monter le composant.
 */

/** Un choix de backend, tel que le serveur le publie. */
export interface ChoixBackend {
  /** Valeur à persister dans `local_audio_backend`. */
  value: string;
  /** Libellé technique du serveur (« Auto (ALSA) », « WASAPI »…). */
  label: string;
}

/** Traduction avec interpolation `{clé}` — même contrat que `$t()`. */
export type Traduire = (key: string, vars?: Record<string, string | number>) => string;

function estChoix(v: unknown): v is ChoixBackend {
  const o = v as ChoixBackend | null;
  return !!o && typeof o.value === 'string' && o.value !== '' && typeof o.label === 'string';
}

/**
 * Les choix à afficher, à partir de la réponse de `GET /system/config`.
 *
 * Trois cas, et aucun d'eux ne réinvente une liste :
 *
 *  1. **Le serveur publie une liste non vide** — on la rend telle quelle,
 *     dans son ordre (`auto` est toujours premier, c'est le contrat serveur).
 *
 *  2. **Le serveur publie une liste VIDE** — build sans `local-audio` : il n'y
 *     a pas de sortie locale du tout. Aucun choix : l'appelant masque le
 *     sélecteur plutôt que de proposer un réglage sans effet.
 *
 *  3. **Le champ est absent** — serveur antérieur à #1268. On ne rétablit
 *     surtout pas Auto/WASAPI/ASIO en dur : ce serait le défaut d'origine. On
 *     rend `auto`, plus la valeur DÉJÀ persistée si elle diffère — de sorte
 *     qu'un utilisateur Windows sur un vieux serveur garde son réglage sous
 *     les yeux et puisse y revenir, sans qu'on propose à un Linuxien une
 *     technologie que sa machine n'a pas.
 */
export function choixDeBackend(config: unknown): ChoixBackend[] {
  const c = (config ?? {}) as Record<string, unknown>;
  const publies = c.supported_audio_backends;

  if (Array.isArray(publies)) {
    // Cas 1 et 2 : la liste du serveur fait foi, vide comprise.
    return publies.filter(estChoix);
  }

  // Cas 3 : champ absent.
  const persiste = backendPersiste(config);
  const choix: ChoixBackend[] = [{ value: 'auto', label: 'Auto' }];
  if (persiste !== 'auto') choix.push({ value: persiste, label: persiste.toUpperCase() });
  return choix;
}

/**
 * La valeur retenue par le serveur, normalisée en minuscules.
 *
 * `audio_backend` est l'ancien nom, `local_audio_backend` le nom courant ; on
 * lit les deux, comme le faisait déjà l'écran. Le repli est `auto` et NON
 * `wasapi` : l'ancien code repliait sur `wasapi`, ce qui affichait « WASAPI »
 * à tout serveur Linux muet sur la question.
 */
export function backendPersiste(config: unknown): string {
  const c = (config ?? {}) as Record<string, unknown>;
  const brut = c.local_audio_backend ?? c.audio_backend;
  return typeof brut === 'string' && brut.trim() !== '' ? brut.trim().toLowerCase() : 'auto';
}

/**
 * La valeur à SÉLECTIONNER dans la liste.
 *
 * Si la valeur persistée n'est pas proposée par la plateforme, on retombe sur
 * `auto` — exactement ce que fait le serveur dans sa réponse, et exactement ce
 * que fait la lecture (`select_host` joue via le host par défaut pour toute
 * valeur inconnue). Laisser le `<select>` sur une valeur absente de ses
 * options l'afficherait vide.
 */
export function backendSelectionne(config: unknown, choix: ChoixBackend[]): string {
  const valeur = backendPersiste(config);
  return choix.some((c) => c.value === valeur) ? valeur : 'auto';
}

/**
 * Le libellé affiché : celui du serveur, avec « Auto » traduit.
 *
 * Le serveur écrit « Auto (ALSA) », « Auto (WASAPI) », « Auto (CoreAudio) » —
 * le mot est de l'anglais lisible, la parenthèse un nom propre. On traduit le
 * seul mot traduisible et on garde la parenthèse intacte.
 */
export function libelleBackend(choix: ChoixBackend, tr: Traduire): string {
  if (choix.value !== 'auto') return choix.label;
  const auto = tr('settings.autoDefault');
  const m = choix.label.match(/^Auto\s*(\(.+\))$/);
  return m ? `${auto} ${m[1]}` : auto;
}

/**
 * Le sous-réglage « Mode WASAPI » n'a de sens que si WASAPI est proposé.
 *
 * Il s'affichait dès que le backend valait `wasapi` — ce que le repli en dur
 * garantissait sur Linux, où WASAPI n'existe pas.
 */
export function modeWasapiPertinent(choix: ChoixBackend[], selectionne: string): boolean {
  return selectionne === 'wasapi' && choix.some((c) => c.value === 'wasapi');
}
