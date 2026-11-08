/**
 * BIOGRAPHIES CLIQUABLES — renesenses/tune-server-rust#7910 (Bertrand, 05/11).
 *
 * Le serveur rend, à côté de `bio` (texte brut, inchangé), `bio_segments` :
 * une suite de morceaux de texte, dont certains ouvrent une page de Tune
 * (`lien: { type: 'artiste' | 'album', id }`) ou une page de la source
 * (`url`). Les liens internes sont calculés côté serveur.
 *
 * #8129 — sur une fiche Qobuz, un lien du HTML de Qobuz vers un artiste ou
 * un album Qobuz arrive en `lien_service: { service, type, id }` : il ouvre la
 * fiche de service correspondante dans Tune (`id` est celui du service).
 *
 * Règles côté web :
 *  - aucun HTML de source n'est injecté : les segments sont rendus en texte ;
 *  - une URL n'est gardée que si elle est en https sur un domaine de source
 *    (Wikipédia, Last.fm, Qobuz) — le serveur filtre déjà, on refiltre ;
 *  - des segments qui ne recomposent pas la bio affichée (serveur ancien,
 *    bio éditée entre-temps) sont ignorés : la bio reste en texte.
 */

export type LienDeBio = { type: 'artiste' | 'album'; id: number };

/** #8129 — un artiste ou un album CHEZ UN SERVICE (identifiant du service). */
export type LienDeServiceDeBio = { service: string; type: 'artiste' | 'album'; id: string };

export interface BioSegment {
  texte: string;
  lien?: LienDeBio;
  lien_service?: LienDeServiceDeBio;
  url?: string;
}

/** Les services dont Tune sait ouvrir une fiche depuis une biographie. */
const SERVICES_DES_LIENS: ReadonlySet<string> = new Set(['qobuz']);

const DOMAINES_DES_SOURCES = ['wikipedia.org', 'last.fm', 'qobuz.com'];

/** L'URL si elle est en https sur un domaine de source, sinon null. */
export function urlDeSource(brute: unknown): string | null {
  if (typeof brute !== 'string' || /\s/.test(brute)) return null;
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const hote = url.hostname.toLowerCase().replace(/\.$/, '');
  const permis = DOMAINES_DES_SOURCES.some((d) => hote === d || hote.endsWith(`.${d}`));
  return permis ? url.href : null;
}

function lienValide(l: any): LienDeBio | null {
  if (!l || (l.type !== 'artiste' && l.type !== 'album')) return null;
  const id = Number(l.id);
  return Number.isInteger(id) && id > 0 ? { type: l.type, id } : null;
}

function lienDeServiceValide(l: any): LienDeServiceDeBio | null {
  if (!l || (l.type !== 'artiste' && l.type !== 'album')) return null;
  if (typeof l.service !== 'string' || !SERVICES_DES_LIENS.has(l.service)) return null;
  if (typeof l.id !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(l.id)) return null;
  return { service: l.service, type: l.type, id: l.id };
}

/**
 * Les segments à afficher pour `bio`, ou `null` pour afficher le texte seul.
 * Un segment au lien ou à l'URL invalide redevient du texte.
 */
export function segmentsAffichables(bio: string | null | undefined, segments: unknown): BioSegment[] | null {
  const texte = (bio ?? '').trim();
  if (!texte || !Array.isArray(segments) || segments.length === 0) return null;
  const propres: BioSegment[] = [];
  for (const s of segments as any[]) {
    if (!s || typeof s.texte !== 'string') return null;
    const lien = lienValide(s.lien);
    const lienService = lien ? null : lienDeServiceValide(s.lien_service);
    const url = lien || lienService ? null : urlDeSource(s.url);
    propres.push(
      lien ? { texte: s.texte, lien }
        : lienService ? { texte: s.texte, lien_service: lienService }
          : url ? { texte: s.texte, url } : { texte: s.texte },
    );
  }
  if (propres.map((s) => s.texte).join('').trim() !== texte) return null;
  if (!propres.some((s) => s.lien || s.lien_service || s.url)) return null;
  // La bio affichée est rognée : on rogne aussi les bords des segments.
  const premier = propres[0];
  const dernier = propres[propres.length - 1];
  premier.texte = premier.texte.replace(/^\s+/, '');
  dernier.texte = dernier.texte.replace(/\s+$/, '');
  return propres.filter((s) => s.texte.length > 0);
}

/** Ouvre la page de Tune d'un lien interne de biographie. */
export async function ouvrirLienDeBio(lien: LienDeBio, nom: string, depuis: string): Promise<void> {
  if (lien.type === 'album') {
    const { ouvrirAlbum } = await import('../libraryNavigation');
    await ouvrirAlbum(lien.id);
    return;
  }
  const { ouvrirArtisteDepuis } = await import('../ouvrirArtisteDepuis');
  await ouvrirArtisteDepuis({ id: lien.id, name: nom, source: 'local' }, depuis as any);
}

/**
 * #8129 — ouvre la fiche de service (artiste ou album) d'un lien de
 * biographie, comme le fait un clic sur une vignette de ce service.
 */
export async function ouvrirLienDeServiceDeBio(lien: LienDeServiceDeBio, nom: string, depuis: string): Promise<void> {
  if (lien.type === 'artiste') {
    const { ouvrirArtisteDepuis } = await import('../ouvrirArtisteDepuis');
    await ouvrirArtisteDepuis({ source: lien.service, source_id: lien.id, name: nom }, depuis as any);
    return;
  }
  const { activeView, vueDeRetour } = await import('../stores/navigation');
  const { ficheAlbumService } = await import('../stores/streaming');
  vueDeRetour.set(depuis as any);
  ficheAlbumService.set({ service: lien.service as any, id: lien.id, titre: nom, pochette: null });
  activeView.set('streamingalbum');
}
