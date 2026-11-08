// @vitest-environment jsdom
//
// VUE MINI — maquette A « télécommande », validée par Bertrand le 31/10/2026.
//
// Le widget de bureau charge `/?mini=1` depuis la v0.9.64. Depuis la phase 5
// (19/09/2026), plus personne ne lisait ce paramètre : la fenêtre de 380 px
// recevait l'interface COMPLÈTE. Ce banc monte la VRAIE `ShellV2` sous
// `?vue=mini` et sous l'alias `?mini=1`, et vérifie le gabarit téléphone :
// Écouter, barre d'onglets, mini-barre hors d'Écouter, panneaux File et Zones.
//
// La coquille lit l'adresse à son MONTAGE (`vueMiniActive`) : chaque cas pose
// l'adresse, puis monte. Le composant est importé en tête de fichier (#1333).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { feuilleMini } from '../vueMini';
import {
  estVueMiniDans, estDansLeWidget, ongletDeLaVue, estReplie, adresseAction, SEUIL_REPLIE,
} from '../vueMini';
import { formatPour } from '../largeurEcran';
import { destinationAlbum, destinationArtisteMini } from '../navigationMini';

vi.setConfig({ testTimeout: 30_000 });

describe('vue mini — les règles', () => {
  it('lit `?vue=mini` et l’alias `?mini=1` des widgets déjà installés', () => {
    expect(estVueMiniDans('?vue=mini')).toBe(true);
    expect(estVueMiniDans('?mini=1')).toBe(true);
    expect(estVueMiniDans('?vue=mini&hote=widget')).toBe(true);
    expect(estVueMiniDans('')).toBe(false);
    expect(estVueMiniDans('?vue=complete')).toBe(false);
    expect(estVueMiniDans('?mini=0')).toBe(false);
    expect(estVueMiniDans(null)).toBe(false);
  });

  it('ne se croit dans le widget que si le widget le dit', () => {
    expect(estDansLeWidget('?vue=mini&hote=widget')).toBe(true);
    expect(estDansLeWidget('?vue=mini')).toBe(false);
    // `hote=widget` sans la vue mini ne compte pas : les boutons natifs n'ont
    // de sens que dans la fenêtre du mini-lecteur.
    expect(estDansLeWidget('?hote=widget')).toBe(false);
  });

  it('allume l’onglet de la vue, et aucun pour une vue du menu', () => {
    expect(ongletDeLaVue('nowplaying')).toBe('ecouter');
    expect(ongletDeLaVue('library')).toBe('bibliotheque');
    expect(ongletDeLaVue('search')).toBe('recherche');
    expect(ongletDeLaVue('favorites')).toBe('favoris');
    expect(ongletDeLaVue('radios')).toBeNull();
  });

  it('se replie sous 220 px de haut (maquette C : 360 × 140)', () => {
    expect(estReplie(140)).toBe(true);
    expect(estReplie(SEUIL_REPLIE - 1)).toBe(true);
    expect(estReplie(SEUIL_REPLIE)).toBe(false);
    expect(estReplie(560)).toBe(false);
    // Une fenêtre pas encore mesurée n'est pas repliée.
    expect(estReplie(0)).toBe(false);
  });

  it('les gestes natifs vivent sous `/__widget/`, que la fenêtre Tauri intercepte', () => {
    expect(adresseAction('epingle')).toBe('/__widget/epingle');
    expect(adresseAction('replier')).toBe('/__widget/replier');
    expect(adresseAction('complet')).toBe('/__widget/complet');
  });

  it('impose le format tiroir en vue mini, quelle que soit la largeur', () => {
    expect(formatPour(1920, true)).toBe('tiroir');
    expect(formatPour(1920, false)).toBe('large');
  });

  it('mène l’album de bibliothèque à sa fiche, celui d’un service à la Recherche', () => {
    expect(destinationAlbum({ title: 'So What', album_id: 7, album_title: 'Kind of Blue', source: 'local' as any }))
      .toEqual({ type: 'album', albumId: 7 });
    expect(destinationAlbum({ title: 'x', album_id: null, album_title: 'Bitches Brew', source: 'qobuz' as any }))
      .toEqual({ type: 'recherche', requete: 'Bitches Brew', source: 'qobuz' });
    expect(destinationAlbum({ title: 'x' })).toBeNull();
    expect(destinationArtisteMini({ title: 'x', artist_id: 3, artist_name: 'Miles Davis', source: 'local' as any }))
      .toEqual({ type: 'artiste', artistId: 3 });
  });
});

// ---------------------------------------------------------------------------
// La vraie coquille.

const ZONE = {
  id: 1, name: 'Salon', output_type: 'upnp', state: 'playing', volume: 0.5, volume_curve: 'db60',
  current_track: { title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
    album_id: 7, artist_id: 3, source: 'local', format: 'flac', sample_rate: 96000, bit_depth: 24,
    duration_ms: 562_000 },
};
const ZONE2 = { id: 2, name: 'Bureau', output_type: 'local', state: 'paused', volume: 0.3, volume_curve: 'db60' };

function corpsPour(url: string): unknown {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  if (p === '/zones') return [ZONE, ZONE2];
  if (p === '/zones/1') return ZONE;
  if (p === '/zones/2') return ZONE2;
  if (/^\/zones\/\d+\/queue$/.test(p)) return { tracks: [], position: 0, length: 0 };
  if (/\/(profiles|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|featured|new-releases|queue)(\/|$)/.test(p)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(cond: () => boolean, quoi: string, ms = 5_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await respirer();
    flushSync();
  }
}

let demonter: (() => void) | null = null;

/** Monte `ShellV2` sous une adresse donnée. */
function monterSous(adresse: string) {
  history.replaceState(null, '', adresse);
  activeView.set('home');
  feuilleMini.set(null);
  zones.set([ZONE as any, ZONE2 as any]);
  currentZoneId.set(1);
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  demonter = () => { unmount(monte); hote.remove(); };
  return { el: hote };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  demonter?.();
  demonter = null;
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

describe('vue mini — la vraie ShellV2', () => {
  for (const adresse of ['/?vue=mini', '/?mini=1']) {
    it(`${adresse} : Écouter, onglets en bas, ni grappe ni barre de transport`, async () => {
      const { el } = monterSous(adresse);
      await attendreQue(() => !!el.querySelector('[data-ecouter-mini]'), 'l’écran Écouter');
      expect(get(activeView)).toBe('nowplaying');
      expect(el.querySelector('[data-onglets-mini]')).not.toBeNull();
      expect(el.querySelector('[data-bandeau-mini]')).not.toBeNull();
      // Le gabarit téléphone remplace la grappe haut-droite et la barre de
      // transport de bureau : les deux en même temps, c'était l'interface
      // complète tassée dans 380 px.
      expect(el.querySelector('.av-tr')).toBeNull();
      expect(el.querySelector('.transport-bar')).toBeNull();
      // Écouter EST la lecture en cours : pas de mini-barre en double.
      expect(el.querySelector('[data-mini-barre]')).toBeNull();
      expect(el.querySelector('[data-ecouter-mini]')!.textContent).toContain('So What');
      expect(el.querySelector('[data-badge-format]')?.textContent).toBeTruthy();
      // Hors du widget, aucun bouton natif : `/__widget/…` serait un 404.
      expect(el.querySelector('[data-action-widget]')).toBeNull();
    });
  }

  it('hors d’Écouter, la mini-barre reste au-dessus des onglets', async () => {
    const { el } = monterSous('/?vue=mini');
    await attendreQue(() => !!el.querySelector('[data-onglet="bibliotheque"]'), 'les onglets');
    (el.querySelector('[data-onglet="bibliotheque"]') as HTMLButtonElement).click();
    await attendreQue(() => !!el.querySelector('[data-mini-barre]'), 'la mini-barre');
    expect(el.querySelector('[data-onglet="bibliotheque"]')!.classList.contains('on')).toBe(true);
    expect(el.querySelector('[data-ecouter-mini]')).toBeNull();
    // Retour à Écouter par la mini-barre.
    (el.querySelector('[data-mini-barre] .piste') as HTMLButtonElement).click();
    await attendreQue(() => !!el.querySelector('[data-ecouter-mini]'), 'Écouter rouvert');
  });

  it('la file et les zones montent du bas ; Échap les referme', async () => {
    const { el } = monterSous('/?vue=mini');
    await attendreQue(() => !!el.querySelector('[data-ecouter-mini] [data-ouvrir-file]'), 'le bouton File');
    (el.querySelector('[data-ecouter-mini] [data-ouvrir-file]') as HTMLButtonElement).click();
    await attendreQue(() => !!el.querySelector('[data-feuille-mini="file"]'), 'le panneau File');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await attendreQue(() => !el.querySelector('[data-feuille-mini]'), 'le panneau refermé');

    (el.querySelector('[data-pastille-zone]') as HTMLButtonElement).click();
    await attendreQue(() => !!el.querySelector('[data-feuille-mini="zones"]'), 'le panneau Zones');
    const cartes = el.querySelectorAll('[data-zone-mini]');
    expect(cartes.length).toBe(2);
    // La zone choisie porte le curseur ; l'autre son volume en lecture, en dB.
    expect(el.querySelector('[data-zone-mini="1"]')!.classList.contains('choisie')).toBe(true);
    expect(el.querySelector('[data-zone-mini="2"] .vol-lu')?.textContent).toContain('dB');
  });

  it('dans le widget, les gestes natifs naviguent vers `/__widget/…`', async () => {
    const { el } = monterSous('/?vue=mini&hote=widget');
    await attendreQue(() => !!el.querySelector('[data-action-widget]'), 'les boutons natifs');
    const actions = [...el.querySelectorAll('[data-action-widget]')].map((b) => b.getAttribute('data-action-widget'));
    expect(actions).toEqual(['epingle', 'replier', 'complet']);
  });

  it('sans paramètre, la coquille de bureau est intacte', async () => {
    const { el } = monterSous('/');
    await attendreQue(() => !!el.querySelector('.transport-bar'), 'la barre de transport');
    expect(el.querySelector('[data-onglets-mini]')).toBeNull();
    expect(el.querySelector('[data-bandeau-mini]')).toBeNull();
    expect(el.querySelector('.av-tr')).not.toBeNull();
  });
});
