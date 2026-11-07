/**
 * Le panneau « État des greffons » de l'écran Extensions (administrateur).
 *
 * Il s'appuie sur `GET /audio-plugins/` : pour chaque emplacement, `id`,
 * tiers ou non, chargé ou non, `version`, et `error` (motif d'un échec de
 * chargement). Ce motif est une chaîne libre de l'hôte : elle peut contenir
 * des chemins locaux (dossier personnel, bibliothèque native). On les masque
 * avant de les afficher ou de les copier dans un rapport de bogue.
 */
import type { GreffonAudioNatif } from './api';

function nomDeFichier(chemin: string): string {
  const segments = chemin.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

function masquer(chemin: string): string {
  // La ponctuation finale d'une phrase ne fait pas partie du chemin.
  const fin = /[.:]+$/.exec(chemin)?.[0] ?? '';
  const sec = fin ? chemin.slice(0, -fin.length) : chemin;
  const nom = nomDeFichier(sec);
  return nom ? `…/${nom}${fin}` : chemin;
}

const WINDOWS = /(?<!\w)[A-Za-z]:[\\/](?!\/)(?:[^\s"'`<>|,;()]*[\\/])*[^\s"'`<>|,;()]*/g;
// Unix et `~/…` : au moins deux segments, hors URL (`https://hôte/a/b`).
const UNIX = /(?<![\w.:/])~?(?:\/[^\s"'`()<>,;\]\\]+){2,}/g;

/** Remplace chaque chemin absolu (ou `~/…`) par `…/nom-du-fichier`. */
export function masquerLesCheminsLocaux(texte: string | null | undefined): string {
  if (!texte) return '';
  return String(texte).replace(WINDOWS, masquer).replace(UNIX, masquer);
}

/** Les emplacements à montrer, triés : tiers d'abord, puis identifiant. */
export function lignesEtatGreffons(liste: GreffonAudioNatif[] | null | undefined): GreffonAudioNatif[] {
  return (liste ?? [])
    .filter((g) => g && typeof g.id === 'string')
    .sort((a, b) => Number(!!b.third_party) - Number(!!a.third_party) || a.id.localeCompare(b.id));
}

/** Le texte à coller dans un rapport de bogue : clés techniques, non traduites. */
export function texteRapportGreffons(
  liste: GreffonAudioNatif[] | null | undefined,
  hote?: { abi?: number; target?: string },
): string {
  const lignes: string[] = ['Tune audio plugins'];
  if (hote?.abi != null) lignes.push(`abi: ${hote.abi}`);
  if (hote?.target) lignes.push(`target: ${hote.target}`);
  for (const g of lignesEtatGreffons(liste)) {
    const parties = [
      g.id,
      g.third_party ? 'third_party' : 'builtin',
      g.native_loaded ? 'loaded' : 'not_loaded',
      `version=${g.version || '-'}`,
    ];
    if (g.error) parties.push(`error=${masquerLesCheminsLocaux(g.error)}`);
    lignes.push(`- ${parties.join(' | ')}`);
  }
  return lignes.join('\n');
}
