// @vitest-environment jsdom
/**
 * #990 — l'Historique dit « à partir de quand une écoute compte ».
 *
 * La règle affichée est celle du serveur (tune-server-rust, lot
 * batch/bugs-rc5-20261012 @ 68281702f) :
 *  - `tune-core/src/orchestrator/transport.rs:1672` — `record_listen` n'écrit
 *    l'écoute que si `output_sent` (le son est parti vers la sortie), au
 *    démarrage, sans durée minimale, et jamais pour la radio ;
 *  - `tune-core/src/scrobble.rs:4-6` — Last.fm : 50 % du titre, plafonné à
 *    4 min, titres de moins de 30 s exclus.
 *
 * Le test monte le VRAI écran (liste vide : la règle doit se lire avant même
 * la première écoute) et vérifie que le texte rendu est la traduction, pas
 * la clé nue ni rien du tout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory } from '../stores/history';
import { t } from '../i18n';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const CLE = 'v2.hist.regleEcoute';

class GeometryObserver { observe() {} unobserve() {} disconnect() {} }

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  playbackHistory.clear();
  vi.stubGlobal('ResizeObserver', GeometryObserver);
  vi.stubGlobal('IntersectionObserver', GeometryObserver);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })));
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  target.remove();
  vi.unstubAllGlobals();
});

describe('#990 — la règle d’une écoute est écrite dans l’Historique', () => {
  it('l’écran affiche la règle, liste vide comprise', async () => {
    component = mount(HistoriqueV2, { target });
    for (let i = 0; i < 10; i++) { await Promise.resolve(); flushSync(); }
    const regle = target.querySelector('header .regle');
    expect(regle, 'aucune règle affichée dans l’en-tête').not.toBeNull();
    const texte = regle!.textContent?.trim() ?? '';
    expect(texte).toBe(get(t)(CLE));
    expect(texte).not.toBe(CLE);
    expect(texte.length).toBeGreaterThan(40);
  });

  it.each(ONZE_LANGUES)('la règle est traduite en %s', (code) => {
    const d = dictionnaire(code);
    expect(d[CLE], `${code} : clé absente`).toBeTruthy();
    // Les chiffres de la règle serveur doivent survivre à la traduction.
    expect(d[CLE]).toMatch(/4/);
    expect(d[CLE]).toMatch(/30/);
    expect(d[CLE]).toContain('Last.fm');
    if (code !== 'fr') expect(d[CLE]).not.toBe(dictionnaire('fr')[CLE]);
  });

  it('le français dit la règle du serveur : dès la sortie, sans durée minimale, hors radio', () => {
    const fr = dictionnaire('fr')[CLE];
    expect(fr).toMatch(/dès que le son part vers la sortie/);
    expect(fr).toMatch(/quelques secondes compte aussi/);
    expect(fr).toMatch(/radios/i);
  });
});
