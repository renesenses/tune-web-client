// @vitest-environment jsdom
// Panneau « État des greffons » : appel GET /audio-plugins/, affichage, état
// vide, refus (403), masquage des chemins locaux, copie pour un rapport.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { etatAffiche, masquerLesCheminsLocaux, texteRapportGreffons } from '../etatGreffons';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import EtatGreffonsV2 from '../../components/v2/EtatGreffonsV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const REPONSE = {
  abi: 1, target: 'x86_64-unknown-linux-gnu', trust_configured: true,
  plugins: [
    { id: 'equalizer', third_party: false, native_loaded: false, error: null, version: null },
    { id: 'crosstalk', third_party: true, native_loaded: false, version: '1.2.0',
      error: 'dlopen /home/bertrand/.local/share/tune/plugins/crosstalk/libcrosstalk.so: undefined symbol' },
    { id: 'crossfeed-pro', third_party: true, native_loaded: true, error: null, version: '0.4.1' },
  ],
};

let cible: HTMLElement; let composant: any; let appels: string[];
function reponse(statut: number, corps: unknown) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
}
async function monter(statut: number, corps: unknown) {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (u: any) => { appels.push(String(u)); return reponse(statut, corps); }));
  composant = mount(EtatGreffonsV2, { target: cible });
  await new Promise((r) => setTimeout(r, 30));
  flushSync();
}
beforeEach(() => { cible = document.createElement('div'); document.body.appendChild(cible); });
afterEach(() => { if (composant) unmount(composant); composant = null; cible.remove(); vi.unstubAllGlobals(); });

describe('masquage des chemins locaux', () => {
  it('remplace les chemins absolus par …/nom', () => {
    expect(masquerLesCheminsLocaux('dlopen /home/bertrand/x/libfoo.so: bad')).toBe('dlopen …/libfoo.so: bad');
    expect(masquerLesCheminsLocaux('open ~/plugins/a/b.dylib failed')).toBe('open …/b.dylib failed');
    expect(masquerLesCheminsLocaux('C:\\Users\\Bertrand\\AppData\\p\\foo.dll introuvable')).toBe('…/foo.dll introuvable');
    expect(masquerLesCheminsLocaux('(/Users/bertrand/Lib/z.so)')).toBe('(…/z.so)');
  });
  it('laisse les URL et le texte sans chemin', () => {
    expect(masquerLesCheminsLocaux('see https://mozaiklabs.fr/api/v1/x ABI 1/2')).toBe('see https://mozaiklabs.fr/api/v1/x ABI 1/2');
    expect(masquerLesCheminsLocaux(null)).toBe('');
  });
});

describe('texte du rapport', () => {
  it('liste chaque greffon, sans chemin', () => {
    const txt = texteRapportGreffons(REPONSE.plugins, REPONSE);
    expect(txt).toContain('crosstalk | third_party | not_loaded | version=1.2.0 | error=dlopen …/libcrosstalk.so: undefined symbol');
    expect(txt).toContain('equalizer | builtin | not_loaded | version=-');
    expect(txt).not.toContain('/home/bertrand');
  });
});

describe('panneau État des greffons', () => {
  it('appelle GET /audio-plugins/ et affiche état, version, erreur masquée', async () => {
    await monter(200, REPONSE);
    expect(appels[0]).toMatch(/\/audio-plugins\/$/);
    expect(cible.querySelectorAll('[data-etat-greffon]').length).toBe(3);
    const ct = cible.querySelector('[data-etat-greffon="crosstalk"]')!;
    expect(ct.textContent).toContain('1.2.0');
    expect(ct.querySelector('[data-etat-erreur]')!.textContent).toBe('dlopen …/libcrosstalk.so: undefined symbol');
    expect(cible.textContent).not.toContain('/home/bertrand');
  });
  it('copie le rapport dans le presse-papiers', async () => {
    const ecrire = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText: ecrire } });
    await monter(200, REPONSE);
    (cible.querySelector('[data-etat-copier]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(ecrire).toHaveBeenCalledOnce();
    expect((ecrire.mock.calls[0] as any)[0]).toContain('crossfeed-pro | third_party | loaded | version=0.4.1');
  });
  it('liste vide : rien', async () => {
    await monter(200, { plugins: [] });
    expect(cible.querySelector('[data-etat-greffons]')).toBeNull();
  });
  it('403 ou panne : rien, sans erreur visible', async () => {
    await monter(403, { error: 'forbidden' });
    expect(cible.querySelector('[data-etat-greffons]')).toBeNull();
    expect(cible.textContent?.trim()).toBe('');
    unmount(composant); composant = null;
    await monter(500, { error: 'boom' });
    expect(cible.textContent?.trim()).toBe('');
  });
});

// tune-server-rust#9151 (fil 2945) : un intégré sans paquet natif tourne par
// son moteur embarqué. Le serveur rend `engine` et `active` ; le panneau ne
// doit plus dire « Not loaded » pour un suréchantillonneur qui marche.
const REPONSE_9151 = {
  abi: 1, target: 'x86_64-unknown-linux-gnu', trust_configured: true,
  plugins: [
    { id: 'upsampler', third_party: false, native_loaded: false, engine: 'bundled', active: true, error: null, version: null },
    { id: 'declick', third_party: false, native_loaded: false, engine: 'bundled', active: false, error: null, version: null },
    { id: 'crosstalk', third_party: true, native_loaded: false, engine: null, active: false, error: null, version: '1.2.0' },
  ],
};

describe('intégrés actifs (#9151)', () => {
  it('un intégré actif sans paquet natif est dit actif, pas non chargé', () => {
    const [up, dc, ct] = REPONSE_9151.plugins as any[];
    expect(etatAffiche(up)).toBe('active');
    expect(etatAffiche(dc)).toBe('inactive');
    // Un tiers sans bibliothèque chargée reste « non chargé » : c'est vrai.
    expect(etatAffiche(ct)).toBe('not_loaded');
    // Serveur ancien (sans `active`) : affichage d'avant, inchangé.
    expect(etatAffiche({ id: 'equalizer', third_party: false, native_loaded: false, error: null })).toBe('not_loaded');
    expect(etatAffiche({ id: 'equalizer', third_party: false, native_loaded: true, active: false, error: null })).toBe('loaded');
  });
  it('le panneau affiche Actif / Inactif et le rapport le dit', async () => {
    await monter(200, REPONSE_9151);
    const up = cible.querySelector('[data-etat-greffon="upsampler"] [data-etat]')!;
    expect(up.getAttribute('data-etat')).toBe('active');
    expect(up.classList.contains('ok')).toBe(true);
    expect(cible.querySelector('[data-etat-greffon="declick"] [data-etat]')!.getAttribute('data-etat')).toBe('inactive');
    const txt = texteRapportGreffons(REPONSE_9151.plugins as any, REPONSE_9151);
    expect(txt).toContain('upsampler | builtin | active | version=-');
    expect(txt).toContain('declick | builtin | inactive | version=-');
  });
});

describe('i18n', () => {
  it('les libellés existent dans les 15 langues', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of ['etatTitle','etatThirdParty','etatBuiltin','etatLoaded','etatNotLoaded','etatActive','etatInactive','etatCopy','etatCopied'])
        expect(d[`v2.plug.${k}`], `${l} ${k}`).toBeTruthy();
    }
  });
});
