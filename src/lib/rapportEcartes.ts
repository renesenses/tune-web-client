/**
 * Ce que le scan a ÉCARTÉ, chemin par chemin — #1068.
 *
 * Belkadi Yacine, fil 1600 : « des fichiers absents » — sans savoir lesquels
 * ni pourquoi. Le serveur le dit pourtant depuis la v0.9.144 et la v0.9.146
 * (tune-server-rust#2060, PR #3666 et #3875) : le fichier de rapport que rend
 * `GET /system/scan/report` porte cinq listes nominatives et un décompte par
 * motif. `grep -rnE 'cue_sheets|sheets_skipped|skipped_empty_file_paths' src/`
 * rendait **0** — écrit côté serveur, jamais branché côté écran.
 *
 * 🔴 Ces listes ne sortent QUE par le fichier, jamais par l'événement
 * `library.scan.completed` : ce sont des chemins de l'utilisateur, et
 * l'événement est diffusé à tous les clients connectés. Il faut donc bien
 * passer par la route, ce que l'écran fait déjà.
 *
 * 🔴 Et elles sont PLAFONNÉES. `skipped_paths_truncated` dit qu'au moins une a
 * atteint son plafond ; le serveur a ajouté cette clé pour que le client ne
 * laisse pas croire à une liste complète — « une liste muette de 500 entrées
 * face à 40 000 fichiers écartés se lit comme un rapport faux ». La taire
 * ici referait le défaut que sa présence évite.
 */

export interface GroupeEcarte {
  /** La clé du rapport, pour la garde et pour la clé de boucle. */
  cle: string;
  /** La clé i18n du titre du groupe. */
  titre: string;
  chemins: string[];
}

/** Un motif d'écart des feuilles CUE, et combien de feuilles il a écartées. */
export interface MotifEcarte {
  motif: string;
  nombre: number;
}

/**
 * Les cinq listes, dans l'ordre où elles répondent à la question du testeur —
 * d'abord ce qui échoue, puis ce qui est ignoré volontairement.
 *
 * Les groupes VIDES sont retirés : une section « 0 fichier de 0 octet » est du
 * bruit dans un rapport qu'on ouvre justement pour trouver quelque chose.
 */
export function groupesEcartes(r: unknown): GroupeEcarte[] {
  const rep = (r ?? {}) as Record<string, unknown>;
  const liste = (k: string): string[] => {
    const v = rep[k];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
  };
  const defs: { cle: string; titre: string }[] = [
    { cle: 'failed_paths', titre: 'v2.scan.skipFailed' },
    { cle: 'skipped_empty_file_paths', titre: 'v2.scan.skipEmpty' },
    { cle: 'cue_sheets_skipped_paths', titre: 'v2.scan.skipCue' },
    { cle: 'skipped_no_metadata_paths', titre: 'v2.scan.skipNoMeta' },
    { cle: 'skipped_unsupported_paths', titre: 'v2.scan.skipUnsupported' },
    { cle: 'skipped_duplicate_paths', titre: 'v2.scan.skipDuplicate' },
  ];
  return defs
    .map((d) => ({ ...d, chemins: liste(d.cle) }))
    .filter((g) => g.chemins.length > 0);
}

/**
 * Le décompte par motif des feuilles CUE écartées
 * (`cue_sheets.sheets_skipped_by_reason`), du plus fréquent au moins fréquent.
 *
 * C'est ce tableau qui répond à « pourquoi » quand la liste de chemins est
 * tronquée : le motif dominant reste juste même sur un échantillon.
 */
export function motifsDesFeuilles(r: unknown): MotifEcarte[] {
  const cue = ((r ?? {}) as any)?.cue_sheets;
  const par = cue?.sheets_skipped_by_reason;
  if (!par || typeof par !== 'object' || Array.isArray(par)) return [];
  return Object.entries(par as Record<string, unknown>)
    .map(([motif, n]) => ({ motif, nombre: Number(n) || 0 }))
    .filter((m) => m.nombre > 0)
    .sort((a, b) => b.nombre - a.nombre || a.motif.localeCompare(b.motif));
}

/** La liste affichée est-elle un ÉCHANTILLON ? */
export function listeTronquee(r: unknown): boolean {
  return ((r ?? {}) as any)?.skipped_paths_truncated === true;
}

/** Y a-t-il seulement quelque chose à montrer ? */
export function aDesEcarts(r: unknown): boolean {
  return groupesEcartes(r).length > 0 || motifsDesFeuilles(r).length > 0;
}
