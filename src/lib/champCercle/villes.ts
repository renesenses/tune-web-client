/**
 * Tune Circle — trouver sa ville sans connaître ses coordonnées, HORS LIGNE.
 *
 * L'index (`villesDonnees.ts`, généré par `scripts/genererVilles.mjs` depuis
 * GeoNames `cities15000`, licence CC BY 4.0) est un morceau séparé du paquet :
 * il n'est chargé qu'à l'ouverture du réglage « Montrer ma ville », par import
 * dynamique, puis gardé en mémoire. La recherche est locale : aucune
 * géolocalisation, aucun service de géocodage, rien ne quitte le navigateur.
 */

export interface Ville {
  nom: string;
  pays: string;
  lat: number;
  lon: number;
  /** Population, en milliers (l'index est déjà trié par population décroissante). */
  pop: number;
  /** Clés de recherche : nom et nom ASCII, sans accents, en minuscules. */
  cles: string[];
}

/** Attribution exigée par la licence de l'index. */
export const ATTRIBUTION_VILLES = 'GeoNames (geonames.org), CC BY 4.0';

/** Sans accents, minuscules, tirets et apostrophes changés en espaces. */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[-'’.]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Lit le format compact « nom|ascii|pays|lat×10|lon×10|pop ». */
export function lireIndex(texte: string): Ville[] {
  const villes: Ville[] = [];
  for (const ligne of texte.split('\n')) {
    const [nom, ascii, pays, lat, lon, pop] = ligne.split('|');
    if (!nom || !pays) continue;
    const cles = [normaliser(nom)];
    if (ascii) { const a = normaliser(ascii); if (a !== cles[0]) cles.push(a); }
    villes.push({ nom, pays, lat: Number(lat) / 10, lon: Number(lon) / 10, pop: Number(pop) || 0, cles });
  }
  return villes;
}

let index: Promise<Ville[]> | null = null;

/** L'index, chargé une fois et à la demande (import dynamique : morceau séparé). */
export function chargerVilles(): Promise<Ville[]> {
  if (!index) {
    index = import('./villesDonnees').then((m) => lireIndex(m.VILLES));
    index.catch(() => { index = null; });
  }
  return index;
}

/** Pour les tests : l'index a-t-il été demandé ? */
export function villesDemandees(): boolean { return index !== null; }

/**
 * Les villes qui répondent à une saisie, les plus peuplées d'abord : d'abord
 * celles dont le nom COMMENCE par la saisie, puis celles dont un mot du nom
 * commence par elle (« etienne » → Saint-Étienne). « Dijon, FR » filtre le pays.
 */
export function chercherVilles(villes: Ville[], saisie: string, max = 8): Ville[] {
  const [tete, queue] = saisie.split(',');
  const q = normaliser(tete ?? '');
  const pays = (queue ?? '').trim().toUpperCase();
  if (q.length < 2) return [];
  const debut: Ville[] = [];
  const mot: Ville[] = [];
  const motQ = ' ' + q;
  for (const v of villes) {
    if (pays && !v.pays.startsWith(pays)) continue;
    if (v.cles.some((c) => c.startsWith(q))) { debut.push(v); if (debut.length >= max) break; }
    else if (mot.length < max && q.length >= 3 && v.cles.some((c) => c.includes(motQ))) mot.push(v);
  }
  return [...debut, ...mot].slice(0, max);
}

/** La ville dont le nom est EXACTEMENT la saisie (la plus peuplée), ou `null`. */
export function villeExacte(villes: Ville[], saisie: string): Ville | null {
  const [tete, queue] = saisie.split(',');
  const q = normaliser(tete ?? '');
  const pays = (queue ?? '').trim().toUpperCase();
  if (!q) return null;
  return villes.find((v) => (!pays || v.pays === pays) && v.cles.includes(q)) ?? null;
}
