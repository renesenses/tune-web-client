/**
 * Historique : une ligne par TITRE ou une ligne par ÉCOUTE — web#3143.
 *
 * Deux demandes de testeurs se contredisent : Elie voulait une ligne par
 * titre, sa plus récente écoute (le comportement livré, `fusionnerHistorique`) ;
 * FabienM (fil 2637, point 7) attend celui de l'appli Android, où chaque
 * écoute est une ligne. Décision de Bertrand (17/11/2026) : un réglage, et le
 * défaut reste le comportement actuel.
 *
 * Le type vit ici, seul, pour que `stores/preferences` puisse le lire sans
 * importer `historiqueLecture` (qui tire l'API et les zones : un cycle).
 */
export type ModeHistorique = 'titre' | 'ecoute';

/** Le défaut : une ligne par titre — rien ne bouge pour qui n'a rien demandé. */
export const MODE_HISTORIQUE_DEFAUT: ModeHistorique = 'titre';

export function estModeHistorique(v: unknown): v is ModeHistorique {
  return v === 'titre' || v === 'ecoute';
}

/**
 * L'HEURE d'une écoute, pour le mode « une ligne par écoute ».
 *
 * « il y a 3 h » suffit tant qu'un titre n'a qu'une ligne ; dès que chaque
 * écoute a la sienne, deux écoutes du même titre doivent se distinguer, et
 * c'est l'heure qui les distingue. Aujourd'hui : l'heure seule ; un autre
 * jour : le jour et l'heure. Une date illisible rend une chaîne vide.
 */
export function heureDEcoute(iso: string, maintenant: Date = new Date(), langue?: string): string {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const memeJour = d.getFullYear() === maintenant.getFullYear()
    && d.getMonth() === maintenant.getMonth()
    && d.getDate() === maintenant.getDate();
  const heure: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  try {
    return memeJour
      ? d.toLocaleTimeString(langue, heure)
      : d.toLocaleString(langue, { day: 'numeric', month: 'short', ...heure });
  } catch {
    // Une langue que le moteur ne connaît pas : le format du navigateur.
    return memeJour ? d.toLocaleTimeString(undefined, heure) : d.toLocaleString(undefined, { day: 'numeric', month: 'short', ...heure });
  }
}
