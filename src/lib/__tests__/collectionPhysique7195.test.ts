// @vitest-environment jsdom
//
// tune-server-rust#7195 — « Ma collection physique » : l'écran, ouvert depuis
// sa carte des Extensions, l'attribution Discogs, les trois états d'un disque, « Écouter » sur le service, et la phrase d'un CD inséré
// possédé mais pas copié.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CollectionPhysiqueV2 from '../../components/v2/CollectionPhysiqueV2.svelte';
import { activeView, pendingLibraryAlbum } from '../stores/navigation';
import {
  ATTRIBUTION_DISCOGS, cleErreur, codeDeRefus, collectionPhysiquePlugin, legendeDuDisque,
  nomValide, qualiteDe, urlCollection, type Disque,
} from '../collectionPhysique';
import { preparerLocale } from '../i18n';
import fr from '../locales/fr';

vi.setConfig({ testTimeout: 60_000 });

function reponse(corps: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let greffons: Record<string, unknown>[] = [];
let appels: string[] = [];

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function disque(p: Partial<Disque>): Disque {
  return {
    instance_id: 1, release_id: 1, artiste: 'X', titre: 'T', annee: null, labels: [],
    numeros_catalogue: [], formats: ['Vinyl'], precisions: [], format: 'vinyle',
    lien_discogs: 'https://www.discogs.com/release/1', bibliotheque: null, streaming: [],
    etat: 'nulle_part', copie: null, proposer_extraction: false, ...p,
  };
}

const COLLECTION = {
  statut: 'ok',
  nom_utilisateur: 'exemple',
  compteurs: {
    total: 3,
    par_etat: { bibliotheque: 1, streaming: 1, nulle_part: 1, a_verifier: 0 },
    par_format: { vinyle: 2, cd: 1, sacd: 0, cassette: 0, autre: 0 },
    cd_non_copies: 1,
  },
  disques: [
    disque({
      instance_id: 1, release_id: 249504, artiste: 'Rick Astley', titre: 'Never Gonna Give You Up',
      annee: 1987, labels: ['RCA'], numeros_catalogue: ['PB 41447'], etat: 'bibliotheque',
      lien_discogs: 'https://www.discogs.com/release/249504',
      bibliotheque: { album_id: 42, titre: 'Never Gonna Give You Up', artiste: 'Rick Astley', qualite: 'hi-res',
        format: 'flac', sample_rate: 96000, bit_depth: 24, par: 'musicbrainz_album' },
    }),
    disque({
      instance_id: 2, release_id: 2, artiste: 'Janice McClain', titre: 'Giving My Love', etat: 'streaming',
      streaming: [{ service: 'tidal', id: 'T-42', titre: 'Giving My Love', artiste: 'Janice McClain', par: 'artiste_titre' }],
    }),
    disque({
      instance_id: 3, release_id: 7024, artiste: 'Various', titre: 'The Haçienda', format: 'cd', formats: ['CD'],
      etat: 'nulle_part', copie: false, proposer_extraction: true,
    }),
  ],
  attribution: { texte: 'Data provided by Discogs', lien: 'https://www.discogs.com' },
};

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  greffons = [];
  appels = [];
  collectionPhysiquePlugin.set(null);
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${init?.method ?? 'GET'} ${u}`);
    if (/\/plugins(\?|$)/.test(u)) return reponse(greffons);
    if (u.includes('/ext/collection-physique/reglages')) return reponse({ nom_utilisateur: 'exemple', jeton: 'personnel' });
    if (u.includes('/ext/collection-physique/etat')) {
      return reponse({ nom_utilisateur: 'exemple', avancement: { en_cours: false, etape: null, fait: 0, total: 0 },
        disques: 3, tronquee: false, liste_lue_le: 1, derniere_synchro: 1793361925, derniere_erreur: null });
    }
    if (u.includes('/ext/collection-physique/collection')) return reponse(COLLECTION);
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('collectionphysique');
});

afterEach(() => {
  if (monte) {
    try { unmount(monte); } catch { /* le démontage n'est pas le sujet */ }
    monte = null;
  }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('« Ma collection physique » — fonctions', () => {
  it('les refus se traduisent par leur code, un inconnu par la phrase générique', () => {
    expect(codeDeRefus({ corps: { error: 'collection_physique.collection_privee' } })).toBe('collection_privee');
    expect(cleErreur('collection_privee')).toBe('collectionPhysique.erreur.collection_privee');
    expect(cleErreur('nimporte_quoi')).toBe('collectionPhysique.erreur.generique');
    expect(cleErreur(null)).toBe('collectionPhysique.erreur.generique');
  });

  it('le nom d’utilisateur suit la règle du serveur', () => {
    expect(nomValide('bertrand_b209')).toBe(true);
    expect(nomValide('a/../b')).toBe(false);
    expect(nomValide('')).toBe(false);
  });

  it('la qualité, la légende et l’adresse filtrée', () => {
    expect(qualiteDe({ album_id: 1, titre: '', artiste: null, qualite: null, format: 'flac', sample_rate: 44100, bit_depth: 16, par: '' }))
      .toBe('16 bits · 44.1 kHz');
    expect(legendeDuDisque(disque({ labels: ['RCA'], numeros_catalogue: ['PB 41447'], annee: 1987 }))).toBe('RCA · PB 41447 · 1987');
    expect(urlCollection('cd', 'nulle_part')).toMatch(/\/ext\/collection-physique\/collection\?format=cd&etat=nulle_part$/);
    expect(urlCollection(null, null)).toMatch(/\/collection$/);
  });

  it('chaque clé existe dans les quinze langues', () => {
    const cles = Object.keys(fr).filter((k) => k.startsWith('collectionPhysique.'));
    expect(cles.length).toBeGreaterThan(40);
    const dossier = resolve(__dirname, '../locales');
    for (const l of ['en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(resolve(dossier, `${l}.ts`), 'utf8');
      for (const k of cles) expect(src, `${k} manquant en ${l}`).toContain(`"${k}":`);
    }
  });
});

describe('« Ma collection physique » — écran', () => {
  it('les trois états, la qualité, Écouter chez TIDAL, le CD à extraire et l’attribution', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    const lignes = Array.from(hote!.querySelectorAll('[data-disque]'));
    expect(lignes).toHaveLength(3);
    const rick = hote!.querySelector('[data-disque="249504"]')!;
    expect(rick.textContent).toContain(fr['collectionPhysique.etat.bibliotheque']);
    expect(rick.textContent).toContain('24 bits · 96 kHz');
    (rick.querySelector('[data-ouvrir-album]') as HTMLButtonElement).click();
    flushSync();
    expect(get(pendingLibraryAlbum)).toBe(42);
    expect(get(activeView)).toBe('library');

    const st = hote!.querySelector('[data-etat-disque="streaming"]')!;
    expect(st.querySelector('[data-service="tidal"]')?.textContent).toBe('TIDAL');
    expect(st.querySelector('[data-ecouter]')).not.toBeNull();
    expect(st.querySelector('[data-favori]')).not.toBeNull();

    const cd = hote!.querySelector('[data-disque="7024"]')!;
    expect(cd.textContent).toContain(fr['collectionPhysique.etat.nulle_part']);
    expect(cd.querySelector('[data-proposer-extraction]')).not.toBeNull();

    const att = hote!.querySelector('[data-attribution] a') as HTMLAnchorElement;
    expect(att.textContent).toBe(ATTRIBUTION_DISCOGS);
    expect(att.href).toBe('https://www.discogs.com/');
    // Le jeton n'est jamais demandé ni montré : l'écran ne connaît que son existence.
    expect(hote!.querySelector('[data-compte-du-jeton]')).not.toBeNull();
    expect(hote!.querySelector('input[type="password"]')).toBeNull();
  });

  it('filtrer par format redemande la collection filtrée', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote! });
    await laisserTourner();
    (hote!.querySelector('[data-format="cd"]') as HTMLButtonElement).click();
    await laisserTourner(10);
    expect(appels.some((a) => a.includes('/ext/collection-physique/collection?format=cd'))).toBe(true);
  });
});

describe('« Ma collection physique » — accès à l’écran', () => {
  it('l’écran est monté par la coquille, ouvert par les Extensions, et le CD inséré le consulte', () => {
    const coquille = readFileSync(resolve(__dirname, '../../components/v2/ShellV2.svelte'), 'utf8');
    expect(coquille).toMatch(/\$activeView === 'collectionphysique'[\s\S]{0,120}<CollectionPhysiqueV2 \/>/);
    // Pas d'entrée de barre latérale sans mandat (l'ordre de la barre est un
    // arbitrage de Bertrand, `ordreBarreLaterale.test.ts`) : l'écran s'ouvre
    // par le bouton « Ouvrir » de sa carte dans les Extensions.
    const barre = readFileSync(resolve(__dirname, '../../components/v2/Sidebar.svelte'), 'utf8');
    expect(barre).not.toContain("'collectionphysique'");
    const ext = readFileSync(resolve(__dirname, '../../components/v2/PluginsV2.svelte'), 'utf8');
    expect(ext).toContain("p.name === 'collection-physique' && isActive(p)");
    expect(ext).toContain('refreshCollectionPhysiquePlugin()');
    const cd = readFileSync(resolve(__dirname, '../../components/v2/LectureCdV2.svelte'), 'utf8');
    expect(cd).toContain('cdDansLaCollection(');
    expect(cd).toContain("$t('collectionPhysique.cdNonCopie' as any)");
  });
});
