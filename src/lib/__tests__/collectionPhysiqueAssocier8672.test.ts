// @vitest-environment jsdom
// tune-server-rust#8672 — « Ma collection physique » : un disque « nulle
// part » s'associe à la main à un album de la bibliothèque. La modale ouvre la
// recherche préremplie, montre les candidats de « plusieurs correspondants »,
// associe ; un disque associé à la main se dissocie.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AssocierAlbumModale from '../../components/v2/AssocierAlbumModale.svelte';
import {
  associeALaMain, cleErreur, peutAssocier, remplacerDisque, type AlbumDeLaBibliotheque, type Collection, type Disque,
} from '../collectionPhysique';
import { locale } from '../i18n';
import fr from '../locales/fr';
import * as dictionnaires from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

function album(id: number, titre: string, par: string | null = null): AlbumDeLaBibliotheque {
  return {
    album_id: id, titre, artiste: 'Janice McClain', qualite: null, format: null,
    sample_rate: null, bit_depth: null, cover_path: null, par,
  };
}

function disque(p: Partial<Disque> = {}): Disque {
  return {
    instance_id: 5, release_id: 1050, artiste: 'Janice McClain / The Ritchie Family', titre: 'Giving My Love / Brazil',
    annee: 1979, labels: [], numeros_catalogue: [], formats: ['Vinyl'], precisions: [],
    format: 'vinyle', lien_discogs: 'https://www.discogs.com/release/1050', pochette: false,
    bibliotheque: null, streaming: [], etat: 'nulle_part', copie: null, proposer_extraction: false,
    raison: 'plusieurs_candidats', candidats_locaux: 2,
    ...p,
  };
}

const ASSOCIE = disque({ etat: 'bibliotheque', raison: null, candidats_locaux: null, bibliotheque: album(11, 'Giving My Love / Brazil Expanded Edition', 'manuel') });

let appels: { methode: string; url: string; corps: unknown }[] = [];
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ methode, url, corps: init?.body ? JSON.parse(String(init.body)) : null });
    let charge: unknown = {};
    if (methode === 'GET' && /\/disques\/1050\/albums/.test(url)) {
      const q = new URL(url, 'http://x').searchParams.get('q');
      charge = {
        release_id: 1050,
        requete: q ?? 'Janice McClain Giving My Love / Brazil',
        proposee: 'Janice McClain Giving My Love / Brazil',
        candidats: [album(10, 'Giving My Love / Brazil - Remastered'), album(11, 'Giving My Love / Brazil Expanded Edition')],
        albums: q === 'rien' ? [] : [album(10, 'Giving My Love / Brazil - Remastered')],
        association: null,
      };
    } else if (methode === 'PUT' && /\/disques\/1050\/association$/.test(url)) {
      charge = { disque: ASSOCIE };
    }
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  document.querySelectorAll('[data-associer-album]').forEach((e) => e.closest('.fond')?.remove());
  vi.unstubAllGlobals();
});

describe('#8672 — « Associer à un album »', () => {
  it('ouvre la recherche préremplie et liste les candidats, puis associe', async () => {
    const recus: Disque[] = [];
    let ferme = false;
    monte = mount(AssocierAlbumModale, {
      target: hote,
      props: { disque: disque(), onClose: () => { ferme = true; }, onAssocie: (d: Disque) => recus.push(d) },
    });
    await souffler();
    const champ = document.querySelector<HTMLInputElement>('[data-recherche-bibliotheque]')!;
    expect(champ.value).toBe('Janice McClain Giving My Love / Brazil');
    expect(appels[0].url).toMatch(/\/ext\/collection-physique\/disques\/1050\/albums$/);
    const candidats = [...document.querySelectorAll('[data-candidats] [data-album-a-associer]')].map((e) => e.getAttribute('data-album-a-associer'));
    expect(candidats).toEqual(['10', '11']);
    expect(document.querySelectorAll('[data-resultats] [data-album-a-associer]').length).toBe(1);

    document.querySelector<HTMLButtonElement>('[data-candidats] [data-choisir-album="11"]')!.click();
    await souffler();
    const put = appels.find((a) => a.methode === 'PUT')!;
    expect(put.url).toMatch(/\/disques\/1050\/association$/);
    expect(put.corps).toEqual({ album_id: 11 });
    expect(recus).toHaveLength(1);
    expect(associeALaMain(recus[0])).toBe(true);
    expect(ferme).toBe(true);
  });

  it('une autre recherche passe par `q`, et « aucun résultat » se dit', async () => {
    monte = mount(AssocierAlbumModale, {
      target: hote,
      props: { disque: disque(), onClose: () => {}, onAssocie: () => {} },
    });
    await souffler();
    const champ = document.querySelector<HTMLInputElement>('[data-recherche-bibliotheque]')!;
    champ.value = 'rien';
    champ.dispatchEvent(new Event('input'));
    champ.form!.requestSubmit();
    await souffler();
    expect(appels.at(-1)!.url).toMatch(/\/disques\/1050\/albums\?q=rien$/);
    expect(document.querySelector('[data-aucun-resultat]')?.textContent).toContain(fr['collectionPhysique.associer.aucunResultat']);
  });
});

describe('#8672 — quand le bouton s’offre', () => {
  it('« Associer » sur un disque nulle part ; « Dissocier » sur un disque associé à la main', () => {
    expect(peutAssocier(disque())).toBe(true);
    expect(peutAssocier(disque({ etat: 'streaming' }))).toBe(false);
    expect(peutAssocier(ASSOCIE)).toBe(false);
    expect(associeALaMain(ASSOCIE)).toBe(true);
    const auto = disque({ etat: 'bibliotheque', bibliotheque: album(3, 'x', 'artiste_titre') });
    expect(associeALaMain(auto)).toBe(false);
  });

  it('le disque relu remplace chaque exemplaire de la release, qui garde son instance', () => {
    const c: Collection = {
      statut: 'ok', nom_utilisateur: 'x', compteurs: { total: 3 },
      disques: [disque({ instance_id: 1 }), disque({ instance_id: 2 }), disque({ instance_id: 3, release_id: 7 })],
    };
    const r = remplacerDisque(c, ASSOCIE);
    expect(r.disques.map((d) => [d.instance_id, d.etat])).toEqual([[1, 'bibliotheque'], [2, 'bibliotheque'], [3, 'nulle_part']]);
  });

  it('les refus du serveur sont traduits, dans les 15 langues', () => {
    expect(cleErreur('album_inconnu')).toBe('collectionPhysique.erreur.album_inconnu');
    expect(cleErreur('disque_inconnu')).toBe('collectionPhysique.erreur.disque_inconnu');
    const cles = Object.keys(fr).filter((k) => k.startsWith('collectionPhysique.associer.') || /erreur\.(album|disque)_inconnu$/.test(k));
    expect(cles.length).toBe(12);
    for (const langue of dictionnaires.ONZE_LANGUES) {
      const dico = (dictionnaires as unknown as Record<string, Record<string, string>>)[langue];
      for (const cle of cles) expect(dico[cle], `${langue} : ${cle}`).toBeTruthy();
    }
    expect(dictionnaires.ONZE_LANGUES.length).toBe(15);
  });
});
