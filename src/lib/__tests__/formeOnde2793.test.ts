// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// Fil du forum 2793 — la FORME D'ONDE de la fiche technique d'une piste.
//
// Monte `FormeOnde` (et la fiche entière) contre des réponses simulées de
// `GET /library/tracks/{id}/forme-onde` : deux canaux tracés, chiffres en
// dBFS, écrêtage, échelle, zoom (plage redemandée, repli découpé), et repli
// quand le serveur ne fournit pas la route.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FormeOnde from '../../components/v2/FormeOnde.svelte';
import FicheTechniquePanneau from '../../components/v2/FicheTechniquePanneau.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import { oublierSondageNotes } from '../api';
import {
  versY, cheminBande, colonnesEcretees, cheminEcretees, trancher, zoomer, nombreDb, graduationsOnde,
  ANTI_REBOND_ZOOM_MS,
  type FormeOnde as Forme, type VoieOnde,
} from '../formeOnde';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

function voie(canal: number, amplitude: number, n: number, ecretes = 0): VoieOnde {
  const max = Array.from({ length: n }, () => amplitude);
  if (ecretes) max[n - 1] = 1;
  return {
    canal, min: max.map((x) => -x), max, rms: max.map((x) => x / Math.SQRT2),
    crete_dbfs: ecretes ? 0 : 20 * Math.log10(amplitude), rms_dbfs: 20 * Math.log10(amplitude / Math.SQRT2),
    facteur_crete_db: 3.01, ecretes,
  };
}
function forme(n = 100, debut = 0, duree = 200, ecretes = 0): Forme {
  return {
    version: 1, track_id: 7, colonnes: n, canaux: 2, sample_rate: 44100, debut_s: debut, duree_s: duree,
    seuil_ecretage_dbfs: -0.01,
    global: { crete_dbfs: ecretes ? 0 : -6.02, rms_dbfs: -9.03, facteur_crete_db: 3.01, ecretes },
    voies: [voie(0, 0.5, n), voie(1, 0.25, n, ecretes)],
    calcule_le: '2026-11-13T10:00:00Z', duree_calcul_ms: 900,
  };
}

let requetes: string[] = [];
let statutRoute = 200;
let statutPlage = 200;
let corpsRoute: Forme = forme();
let corpsErreur = 'Not Found';

function repondre(statut: number, corps: unknown): Response {
  return {
    ok: statut < 400, status: statut, statusText: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
    json: async () => corps,
    blob: async () => new Blob(['PNG'], { type: 'image/png' }),
  } as unknown as Response;
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(condition: () => boolean, limiteMs = 10_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}
const boutonTexte = (libelle: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').trim() === libelle);
const canaux = () => [...document.querySelectorAll<HTMLElement>('.canal')];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  locale.set('fr');
  oublierSondageNotes();
  requetes = [];
  statutRoute = 200;
  statutPlage = 200;
  corpsRoute = forme();
  corpsErreur = 'Not Found';
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (e: RequestInfo | URL) => {
    const url = typeof e === 'string' ? e : e.toString();
    requetes.push(url);
    if (url.includes('/forme-onde')) {
      if (url.includes('debut_s=')) {
        if (statutPlage >= 400) return repondre(statutPlage, 'boom');
        const u = new URL(url, 'http://x');
        const d = Number(u.searchParams.get('debut_s'));
        const f = Number(u.searchParams.get('fin_s'));
        return repondre(200, { ...forme(100, d, f - d), voies: [voie(0, 0.9, 100), voie(1, 0.8, 100)] });
      }
      return statutRoute >= 400 ? repondre(statutRoute, statutRoute === 422 ? 'track has no local file' : corpsErreur) : repondre(200, corpsRoute);
    }
    if (url.includes('/fiche-technique')) {
      return repondre(200, {
        track_id: 7, title: 'One', source: 'local', a_un_fichier: true, format: { codec: 'flac', sample_rate: 44100 },
        spectrogramme: null, dynamic_range: null, faux_hires: null, integrite: null, provenance: null, note: null,
        forme_d_onde: { etat: 'a_jour', url: '/api/v1/library/tracks/7/forme-onde?colonnes=1000', colonnes: 1000 },
      });
    }
    if (url.includes('/library/notes')) return repondre(404, { error: 'aucune note' });
    return repondre(200, {});
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('fil 2793 — les règles pures', () => {
  it('échelle linéaire et dB, repère 0 dBFS au bord', () => {
    expect(versY(0.5, 'lineaire')).toBeCloseTo(0.5);
    expect(versY(-1, 'lineaire')).toBe(-1);
    expect(versY(1, 'db')).toBe(1);
    // −6 dBFS sur une échelle de −60 à 0 : 90 % de la hauteur.
    expect(versY(0.5, 'db')).toBeCloseTo(0.9, 2);
    expect(versY(-0.5, 'db')).toBeCloseTo(-0.9, 2);
    expect(versY(0, 'db')).toBe(0);
    expect(graduationsOnde('lineaire')[0]).toEqual({ db: 0, y: 1 });
  });

  it('chemin d’une bande, colonnes écrêtées, chiffres', () => {
    expect(cheminBande([0.5, 0.5], [-0.5, -0.5], 100, 100, 'lineaire')).toBe('M0,25L100,25L100,75L0,75Z');
    const v = voie(0, 0.5, 10, 1);
    expect(colonnesEcretees(v, -0.01)).toEqual([9]);
    // #8664 : le serveur désigne les colonnes (suites à la pleine échelle) ;
    // une crête isolée à 1,0 qu'il n'a pas retenue n'est pas rouge.
    expect(colonnesEcretees({ ...v, colonnes_ecretees: [] })).toEqual([]);
    expect(colonnesEcretees({ ...v, colonnes_ecretees: [2, 3] })).toEqual([2, 3]);
    expect(nombreDb(-6.02, 'fr')).toBe('−6,0');
    expect(nombreDb(null, 'fr')).toBe('−∞');
  });

  it('zoom ×2 centré, borné, et découpe de repli', () => {
    expect(zoomer(null, 2, 200)).toEqual({ debut: 50, fin: 150 });
    expect(zoomer({ debut: 50, fin: 150 }, 0.5, 200)).toBeNull();
    expect(zoomer({ debut: 0, fin: 20 }, 2, 200)).toEqual({ debut: 5, fin: 15 });
    const t = trancher(forme(100, 0, 200), { debut: 50, fin: 150 });
    expect(t.colonnes).toBe(50);
    expect(t.debut_s).toBe(50);
    expect(t.voies[0].max.length).toBe(50);
    const f = forme(100, 0, 200);
    f.voies[1] = { ...f.voies[1], colonnes_ecretees: [10, 30, 60, 99] };
    expect(trancher(f, { debut: 50, fin: 150 }).voies[1].colonnes_ecretees).toEqual([5, 35]);
  });

  it('un seul chemin pour les colonnes écrêtées, les voisines fusionnées', () => {
    expect(cheminEcretees([], 100, 1000, 120)).toBe('');
    expect(cheminEcretees([3, 4, 5, 9], 100, 1000, 120)).toBe('M30,0h30v120h-30ZM90,0h10v120h-10Z');
    // Une colonne plus étroite que 1,5 px garde une largeur visible.
    expect(cheminEcretees([0], 4000, 1000, 120)).toBe('M0,0h1.5v120h-1.5Z');
  });

  it('les libellés existent dans les quinze langues', () => {
    const cles = Object.keys(fr).filter((k) => k.startsWith('fiche.waveform.'));
    expect(cles.length).toBeGreaterThanOrEqual(33);
    expect(cles).not.toContain('fiche.waveform.soon');
    cles.push('fiche.trackNotFound');
    // #8664 : plus de « PLR » pour un facteur de crête non pondéré.
    expect(fr['fiche.waveform.plr']).not.toContain('PLR');
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const k of cles) expect(d[k], `${langue} ${k}`).toBeTruthy();
    }
  });
});

describe('fil 2793 — l’écran', () => {
  it('à jour : charge seule, trace deux canaux et écrit les chiffres', async () => {
    poser(FormeOnde, { trackId: 7, titre: 'One', section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => canaux().length === 2)).toBe(true);
    expect(requetes.filter((u) => u.includes('/forme-onde?colonnes=1000'))).toHaveLength(1);
    const texte = document.body.textContent ?? '';
    expect(texte).toContain(fr['fiche.waveform.left']);
    expect(texte).toContain(fr['fiche.waveform.right']);
    expect(texte).toContain(fr['fiche.waveform.help'].slice(0, 30));
    expect(texte).toContain(fr['fiche.waveform.dbfs'].replace('{n}', '−6,0'));
    expect(texte).toContain(fr['fiche.waveform.dbfs'].replace('{n}', '−9,0'));
    expect(texte).toContain(fr['fiche.waveform.db'].replace('{n}', '3,0'));
    for (const c of canaux()) {
      expect(c.querySelector('path.crete')?.getAttribute('d')).toMatch(/^M.*Z$/);
      expect(c.querySelector('path.rms')?.getAttribute('d')).toMatch(/^M.*Z$/);
    }
    // Repère 0 dBFS aux deux bords.
    expect(canaux()[0].querySelectorAll('line.zero')).toHaveLength(2);
    expect(document.querySelector('tr[data-chiffres="global"]')).not.toBeNull();
    expect(document.querySelectorAll('.ecrete')).toHaveLength(0);
  });

  it('écrêtage : décompte en alerte et colonnes en rouge', async () => {
    corpsRoute = forme(100, 0, 200, 37);
    poser(FormeOnde, { trackId: 7, section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => canaux().length === 2)).toBe(true);
    expect(document.querySelectorAll('.canal[data-canal="1"] path.ecrete')).toHaveLength(1);
    expect(document.querySelectorAll('rect.ecrete')).toHaveLength(0);
    const global = document.querySelector('tr[data-chiffres="global"] td.alerte');
    expect(global?.textContent).toBe('37');
  });

  it('échelle dB : le tracé change', async () => {
    poser(FormeOnde, { trackId: 7, section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => canaux().length === 2)).toBe(true);
    const avant = canaux()[1].querySelector('path.crete')?.getAttribute('d');
    boutonTexte(fr['fiche.waveform.logDb'])!.click();
    flushSync();
    expect(canaux()[1].querySelector('path.crete')?.getAttribute('d')).not.toBe(avant);
  });

  it('zoom ×2 : la plage est redemandée au serveur ; repli découpé si elle échoue', async () => {
    poser(FormeOnde, { trackId: 7, section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => canaux().length === 2)).toBe(true);
    boutonTexte(fr['fiche.waveform.zoomIn'])!.click();
    expect(await attendreQue(() => requetes.some((u) => u.includes('debut_s=50.000') && u.includes('fin_s=150.000')))).toBe(true);
    // La plage détaillée (0,9 de crête) remplace la découpe (0,5).
    expect(await attendreQue(() => (canaux()[0].querySelector('path.crete')?.getAttribute('d') ?? '').startsWith('M0,6'))).toBe(true);
    expect(document.querySelector('.temps')?.textContent).toContain('0:50');
    boutonTexte(fr['fiche.waveform.zoomAll'])!.click();
    flushSync();
    expect(document.querySelector('.temps')?.textContent).toContain('0:00');

    statutPlage = 500;
    boutonTexte(fr['fiche.waveform.zoomIn'])!.click();
    expect(await attendreQue(() => requetes.filter((u) => u.includes('debut_s=')).length === 2)).toBe(true);
    await attendreQue(() => false, 50);
    // Repli : la découpe de la piste entière reste affichée.
    expect(document.querySelector('.temps')?.textContent).toContain('0:50');
    expect(canaux()).toHaveLength(2);
  });

  it('anti-rebond : des clics ×2 rapprochés ne demandent que la dernière plage', async () => {
    poser(FormeOnde, { trackId: 7, section: { etat: 'a_jour', url: '', colonnes: 1000 } });
    expect(await attendreQue(() => canaux().length === 2)).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      boutonTexte(fr['fiche.waveform.zoomIn'])!.click();
      flushSync();
    }
    // La découpe s'affiche tout de suite, sans requête.
    expect(document.querySelector('.temps')?.textContent).toContain('1:26');
    expect(requetes.filter((u) => u.includes('debut_s='))).toHaveLength(0);
    expect(await attendreQue(() => requetes.some((u) => u.includes('debut_s=')))).toBe(true);
    await attendreQue(() => false, ANTI_REBOND_ZOOM_MS + 100);
    const plages = requetes.filter((u) => u.includes('debut_s='));
    expect(plages).toHaveLength(1);
    expect(plages[0]).toContain('debut_s=87.500');
    expect(plages[0]).toContain('fin_s=112.500');
  });

  it('piste inconnue (404 « track not found ») : ni « indisponible » ni réessai', async () => {
    statutRoute = 404;
    corpsErreur = 'track not found';
    poser(FormeOnde, { trackId: 7, section: null });
    boutonTexte(fr['fiche.waveform.compute'])!.click();
    expect(await attendreQue(() => (document.body.textContent ?? '').includes(fr['fiche.trackNotFound']))).toBe(true);
    expect(document.body.textContent).not.toContain(fr['fiche.waveform.unavailable']);
    expect(boutonTexte(fr['fiche.waveform.compute'])).toBeUndefined();
  });

  it('absent : rien n’est calculé avant le bouton', async () => {
    poser(FormeOnde, { trackId: 7, section: { etat: 'absent', url: '', colonnes: 1000 } });
    await attendreQue(() => false, 30);
    expect(requetes).toHaveLength(0);
    boutonTexte(fr['fiche.waveform.compute'])!.click();
    expect(await attendreQue(() => canaux().length === 2)).toBe(true);
  });

  it('repli : un serveur sans la route dit que la fonction manque', async () => {
    statutRoute = 404;
    poser(FormeOnde, { trackId: 7, section: null });
    boutonTexte(fr['fiche.waveform.compute'])!.click();
    expect(await attendreQue(() => (document.body.textContent ?? '').includes(fr['fiche.waveform.unavailable']))).toBe(true);
    expect(canaux()).toHaveLength(0);
  });

  it('piste sans fichier local : 422, le dit sans proposer de réessayer', async () => {
    statutRoute = 422;
    poser(FormeOnde, { trackId: 7, section: null });
    boutonTexte(fr['fiche.waveform.compute'])!.click();
    expect(await attendreQue(() => (document.body.textContent ?? '').includes(fr['fiche.waveform.unavailableSource']))).toBe(true);
    expect(boutonTexte(fr['fiche.waveform.compute'])).toBeUndefined();
  });

  it('réponse 11020 : la sonie EBU R128 déjà mesurée, en chiffres, sans calcul', async () => {
    poser(FormeOnde, {
      trackId: 7,
      section: { etat: 'absent', url: '', colonnes: 1000, sonie: { integree_lufs: -14.8, crete_vraie_dbtp: 0.4, mesure_le: '2026-11-09T10:00:00Z' } },
    });
    const bloc = document.querySelector<HTMLElement>('[data-sonie]');
    expect(bloc).not.toBeNull();
    const t = bloc!.textContent ?? '';
    expect(t).toContain(fr['fiche.waveform.lufs'].replace('{n}', '\u221214,8'));
    expect(t).toContain(fr['fiche.waveform.dbtp'].replace('{n}', '0,4'));
    expect(t).toContain(fr['fiche.waveform.loudnessHelp'].slice(0, 20));
    // Au-dessus de 0 dBTP : en alerte.
    expect(bloc!.querySelector('dd.alerte')).not.toBeNull();
    expect(requetes).toHaveLength(0);
  });

  it('sans sonie mesurée : aucun bloc vide', () => {
    poser(FormeOnde, { trackId: 7, section: { etat: 'absent', url: '', colonnes: 1000 } });
    expect(document.querySelector('[data-sonie]')).toBeNull();
  });

  it('branchée dans la fiche technique', async () => {
    poser(FicheTechniquePanneau, { trackId: 7, titre: 'One', onClose: () => {} });
    expect(await attendreQue(() => canaux().length === 2)).toBe(true);
    expect(document.querySelector('section[data-section="formeDOnde"] svg[role="img"]')).not.toBeNull();
  });
});
