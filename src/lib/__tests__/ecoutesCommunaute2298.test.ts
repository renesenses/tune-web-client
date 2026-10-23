// @vitest-environment jsdom
//
// renesenses/tune-web-client#2298 — « So What (128) » : les écoutes de la
// communauté Tune entre parenthèses, dans les listes de pistes, la grille et
// la fiche des albums, la fiche artiste. Le serveur
// (renesenses/tune-server-rust#6738) envoie `community_listens` seulement à
// partir de trois comptes : sans le champ, RIEN n'est affiché.
//
// 🔴 CES TÉMOINS MONTENT ET REGARDENT : la liste de pistes partagée et
// l'en-tête de fiche artiste, tels que les écrans les rendent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import EnTeteArtiste from '../../components/v2/EnTeteArtiste.svelte';
import EcoutesCommunaute from '../../components/partages/EcoutesCommunaute.svelte';
import { ecoutesDe, texteEcoutes } from '../ecoutesCommunaute';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import { preferences } from '../stores/preferences';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown> = {}): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  return hote;
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const piste = (id: number, title: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, artist_name: 'Miles Davis', album_id: 3, source: 'local', ...extra }) as any;

describe('#2298 — le nombre, et rien sans le champ', () => {
  it('ecoutesDe ne rend un nombre que pour un entier positif', () => {
    expect(ecoutesDe({ community_listens: 128 })).toBe(128);
    for (const v of [undefined, null, 0, -3, Number.NaN, '128' as any]) {
      expect(ecoutesDe({ community_listens: v }), String(v)).toBeNull();
    }
    expect(ecoutesDe(null)).toBeNull();
  });

  it('le texte suit la langue', () => {
    expect(texteEcoutes(128, 'fr')).toBe('(128)');
    expect(texteEcoutes(43100, 'en')).toBe('(43,100)');
  });

  it('le composant seul : « (5 400) » avec son infobulle, rien sans le champ', () => {
    let el = poser(EcoutesCommunaute, { objet: { community_listens: 5400 } });
    const s = el.querySelector('[data-ecoutes-communaute]');
    expect(s, 'le total n’est pas affiché').not.toBeNull();
    expect(s!.textContent!.replace(/\s/g, ' ')).toMatch(/^\(5\s?400\)$/);
    expect(s!.getAttribute('title')).toBe('Écoutes de la communauté Tune');
    unmount(monte!);
    hote!.remove();
    el = poser(EcoutesCommunaute, { objet: {} });
    expect(el.textContent!.trim()).toBe('');
  });
});

describe('#2298 — les écrans', () => {
  it('🔴 la liste de pistes affiche « So What (128) », et rien pour la piste sans champ', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' })));
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    const el = poser(ListePistesV2, {
      pistes: [piste(1, 'So What', { community_listens: 128 }), piste(2, 'Freddie Freeloader')],
      onLire: () => {},
    });
    const lignes = el.querySelectorAll('.tbl .trow');
    expect(lignes.length, 'le tableau ne rend pas les deux lignes').toBe(2);
    const titre1 = lignes[0].querySelector('.titre')!;
    const titre2 = lignes[1].querySelector('.titre')!;
    expect(titre1.querySelector('[data-ecoutes-communaute]')?.textContent).toBe('(128)');
    expect(titre1.textContent).toContain('So What');
    expect(titre2.querySelector('[data-ecoutes-communaute]'), 'un nombre inventé').toBeNull();
    expect(titre2.textContent).not.toContain('(');
  });

  it('🔴 la fiche artiste affiche le total à côté du nom', () => {
    const el = poser(EnTeteArtiste, {
      nom: 'Miles Davis',
      ecoutes: { community_listens: 43100 },
      onRetour: () => {},
    });
    const h1 = el.querySelector('h1')!;
    expect(h1.querySelector('[data-ecoutes-communaute]'), 'le total de l’artiste manque').not.toBeNull();
    unmount(monte!);
    hote!.remove();
    const sans = poser(EnTeteArtiste, { nom: 'Miles Davis', onRetour: () => {} });
    expect(sans.querySelector('[data-ecoutes-communaute]')).toBeNull();
  });
});

describe('#2298 — l’infobulle dans les douze langues', () => {
  it('chaque dictionnaire porte sa propre traduction', () => {
    const vus = new Set<string>();
    for (const l of ONZE_LANGUES) {
      const v = (dictionnaire(l) as Record<string, string>)['library.communityListensTip'];
      expect(v, `${l} : clé absente`).toBeTruthy();
      expect(v, `${l} : Tune doit rester nommé`).toContain('Tune');
      vus.add(v);
    }
    expect(vus.size, 'deux langues partagent le même texte').toBe(ONZE_LANGUES.length);
  });
});
