// @vitest-environment jsdom
//
// tune-server-rust#8070 (discussion #8281, reprise en rc12, go de Bertrand du
// 12/11/2026) — « Ma collection physique » : sous un disque « nulle part »,
// une courte phrase dit pourquoi ; le compteur de chaque raison se lit à
// côté du filtre « nulle part ». Le greffon sert `raison`, `candidats_locaux`
// et `compteurs.par_raison` depuis #7981.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CollectionPhysiqueV2 from '../../components/v2/CollectionPhysiqueV2.svelte';
import { activeView } from '../stores/navigation';
import { ficheAlbumService } from '../stores/streaming';
import {
  CLE_AFFICHAGE, collectionPhysiquePlugin, compteursDeRaison, raisonDuDisque, RAISONS, type Disque,
} from '../collectionPhysique';
import { preparerLocale } from '../i18n';
import fr from '../locales/fr';
import { detailOuvert } from '../historiqueCoquille';

vi.setConfig({ testTimeout: 60_000 });

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
  json: async () => corps, text: async () => JSON.stringify(corps),
}) as unknown as Response;
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

function disque(p: Partial<Disque>): Disque {
  return {
    instance_id: 1, release_id: 1, artiste: 'X', titre: 'T', annee: null, labels: [],
    numeros_catalogue: [], formats: ['Vinyl'], precisions: [], format: 'vinyle',
    lien_discogs: 'https://www.discogs.com/release/1', bibliotheque: null, streaming: [],
    etat: 'nulle_part', copie: null, proposer_extraction: false, ...p,
  };
}

let collection: any;
const COLLECTION = () => ({
  statut: 'ok', nom_utilisateur: 'exemple',
  compteurs: {
    total: 4,
    par_etat: { bibliotheque: 1, streaming: 0, nulle_part: 3, a_verifier: 0 },
    par_format: { vinyle: 4, cd: 0, sacd: 0, cassette: 0, autre: 0 },
    par_raison: { aucun_candidat: 1, plusieurs_candidats: 1, service_non_interroge: 1 },
    cd_non_copies: 0,
  },
  disques: [
    disque({ instance_id: 1, release_id: 11, titre: 'Abbey Road', raison: 'plusieurs_candidats', candidats_locaux: 2 }),
    disque({ instance_id: 2, release_id: 12, titre: 'Inconnu', raison: 'aucun_candidat', candidats_locaux: null }),
    disque({ instance_id: 3, release_id: 13, titre: 'Sans service', raison: 'service_non_interroge' }),
    disque({ instance_id: 4, release_id: 14, titre: 'Chez moi', etat: 'bibliotheque', raison: null,
      bibliotheque: { album_id: 42, titre: 'Chez moi', artiste: null, qualite: null, format: null, sample_rate: null, bit_depth: null, par: 'x' } }),
  ],
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  try { localStorage.clear(); } catch { /* indisponible */ }
  collection = COLLECTION();
  ficheAlbumService.set(null);
  detailOuvert.set(null);
  collectionPhysiquePlugin.set(null);
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/ext/collection-physique/reglages')) return reponse({ nom_utilisateur: 'exemple', jeton: 'personnel' });
    if (u.includes('/ext/collection-physique/etat')) {
      return reponse({ nom_utilisateur: 'exemple', avancement: { en_cours: false, etape: null, fait: 0, total: 0 },
        disques: 4, tronquee: false, liste_lue_le: Math.floor(Date.now() / 1000), derniere_synchro: 1793361925,
        derniere_erreur: null, affinage_musicbrainz: { en_cours: false, restants: 0 } });
    }
    if (u.includes('/ext/collection-physique/collection')) return reponse(collection);
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('collectionphysique');
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove(); hote = null;
  vi.unstubAllGlobals();
});

describe('#8070 — fonctions', () => {
  it('la phrase d’un disque « nulle part », avec le nombre de candidats', () => {
    expect(raisonDuDisque(disque({ raison: 'plusieurs_candidats', candidats_locaux: 3 })))
      .toEqual({ cle: 'collectionPhysique.raison.plusieurs_candidats', n: 3 });
    expect(raisonDuDisque(disque({ raison: 'aucun_candidat' }))).toEqual({ cle: 'collectionPhysique.raison.aucun_candidat', n: null });
  });

  it('CONTRE-ÉPREUVE : autre état, raison absente (greffon antérieur) ou inconnue → rien', () => {
    expect(raisonDuDisque(disque({ etat: 'bibliotheque', raison: 'aucun_candidat' }))).toBeNull();
    expect(raisonDuDisque(disque({}))).toBeNull();
    expect(raisonDuDisque(disque({ raison: 'nouvelle_raison' as any }))).toBeNull();
  });

  it('les compteurs non nuls, dans l’ordre ; rien sans `par_raison`', () => {
    expect(compteursDeRaison({ compteurs: { total: 3, par_raison: { service_non_interroge: 2, aucun_candidat: 1, plusieurs_candidats: 0 } } }))
      .toEqual([{ raison: 'aucun_candidat', n: 1 }, { raison: 'service_non_interroge', n: 2 }]);
    expect(compteursDeRaison({ compteurs: { total: 3 } })).toEqual([]);
  });

  it('chaque phrase existe dans les quinze langues', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(resolve(__dirname, '../locales', `${l}.ts`), 'utf8');
      for (const r of RAISONS) {
        expect(src, `raison ${r} manquante en ${l}`).toContain(`"collectionPhysique.raison.${r}":`);
        expect(src, `raison courte ${r} manquante en ${l}`).toContain(`"collectionPhysique.raisonCourte.${r}":`);
      }
      if (l !== 'fr') {
        const m = src.match(/"collectionPhysique\.raison\.plusieurs_candidats": "([^"]*)"/);
        expect(m?.[1], `{n} absent en ${l}`).toContain('{n}');
      }
    }
  });
});

describe('#8070 — l’écran monté', () => {
  it('🔴 liste : chaque disque « nulle part » dit pourquoi, avec le nombre de candidats', async () => {
    localStorage.setItem(`tune_v2_ecran_${CLE_AFFICHAGE}`, 'list');
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    const abbey = hote!.querySelector('[data-disque="11"] [data-raison-disque]');
    expect(abbey, 'aucune raison sous un disque « nulle part »').not.toBeNull();
    expect(abbey!.textContent).toBe(fr['collectionPhysique.raison.plusieurs_candidats'].replace('{n}', '2'));
    expect(hote!.querySelector('[data-disque="12"] [data-raison-disque]')!.textContent)
      .toBe(fr['collectionPhysique.raison.aucun_candidat']);
    expect(hote!.querySelector('[data-disque="13"] [data-raison-disque]')!.textContent)
      .toBe(fr['collectionPhysique.raison.service_non_interroge']);
    // Contre-épreuve : un disque de la bibliothèque n'a pas de raison.
    expect(hote!.querySelector('[data-disque="14"] [data-raison-disque]')).toBeNull();
  });

  it('🔴 grille : la raison sous le titre et l’artiste', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    expect(hote!.querySelector('[data-grille-collection] [data-disque="12"] [data-raison-disque]')?.textContent)
      .toBe(fr['collectionPhysique.raison.aucun_candidat']);
  });

  it('🔴 les compteurs par raison, à côté du filtre « nulle part »', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    const bloc = hote!.querySelector('[data-compteurs-raison]');
    expect(bloc, 'pas de compteurs par raison').not.toBeNull();
    expect(bloc!.previousElementSibling?.getAttribute('data-etat')).toBe('nulle_part');
    expect(Array.from(bloc!.querySelectorAll('[data-raison]')).map((e) => e.getAttribute('data-raison')))
      .toEqual(['aucun_candidat', 'plusieurs_candidats', 'service_non_interroge']);
    expect(bloc!.textContent).toContain(fr['collectionPhysique.raisonCourte.plusieurs_candidats']);
  });

  it('CONTRE-ÉPREUVE : greffon antérieur sans raison ni compteurs → écran d’avant', async () => {
    collection.compteurs.par_raison = undefined;
    for (const d of collection.disques) { delete d.raison; delete d.candidats_locaux; }
    localStorage.setItem(`tune_v2_ecran_${CLE_AFFICHAGE}`, 'list');
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    expect(hote!.querySelector('[data-compteurs-raison]')).toBeNull();
    expect(hote!.querySelector('[data-raison-disque]')).toBeNull();
    expect(hote!.querySelectorAll('[data-disque]')).toHaveLength(4);
  });
});
