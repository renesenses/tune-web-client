// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { etatLectureDeZone, cleEtatLecture } from '../vueZones';
import { locale } from '../i18n';
import fr from '../locales/fr';

// L'écran Zones ne disait l'état NULLE PART, et sa seule pastille — la zone
// active — est peinte à l'accent du thème. Sur `black-green`, tout est vert :
// « qui joue ? » ne se lisait plus. Et onze cartes sur douze n'avaient aucune
// image, faute de repli quand rien ne joue.

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let serverZones: Record<string, unknown>[];
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
async function settle() {
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}
async function open() {
  component = mount(ZonesV2, { target: host });
  flushSync();
  await settle();
}
beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  serverZones = [
    { id: 1, name: 'Salon', state: 'playing', volume: 0.4, output_type: 'dlna', current_track: { title: 'Peace Piece', album_id: 42 } },
    { id: 2, name: 'Chambre', state: 'paused', volume: 0.3, output_type: 'airplay' },
    { id: 3, name: 'Bureau', state: 'stopped', volume: 0.2, output_type: 'local' },
  ];
  zones.set(serverZones as never);
  currentZoneId.set(1);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/zones')) return response(serverZones);
    if (url.endsWith('/zones/stereo-pairs')) return response([]);
    if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
    if (url.endsWith('/system/diagnostics')) return response({ zones_doublons: [] });
    throw new Error(`Unexpected ${url}`);
  }));
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  zones.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('l’état de lecture d’une zone', () => {
  it('se lit dans `state`, et JAMAIS dans la dernière piste', () => {
    expect(etatLectureDeZone({ state: 'playing' })).toBe('playing');
    expect(etatLectureDeZone({ state: 'PAUSED' })).toBe('paused');
    expect(etatLectureDeZone({ state: 'stopped' })).toBe('idle');
    // `current_track` survit à une pause ET à un arrêt : sans `state`, on ne
    // prétend rien plutôt que d'annoncer une lecture qui n'a pas lieu.
    expect(etatLectureDeZone({ current_track: { title: 'x' } })).toBe('idle');
    expect(etatLectureDeZone({})).toBe('idle');
  });

  it('nomme son libellé par une clé i18n, présente dans les 11 langues', () => {
    expect(cleEtatLecture('playing')).toBe('zone.playing');
    expect(cleEtatLecture('paused')).toBe('zone.paused');
    expect(cleEtatLecture('idle')).toBe('zone.stopped');
    for (const lg of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = readFileSync(resolve(__dirname, `../locales/${lg}.ts`), 'utf8');
      for (const cle of ['zone.playing', 'zone.paused', 'zone.stopped']) {
        expect(src.includes(`'${cle}'`) || src.includes(`"${cle}"`), `${cle} absente de ${lg}`).toBe(true);
      }
    }
  });

  it('🔴 n’est PAS peint à l’accent du thème, mais aux jetons sémantiques', () => {
    const chip = readFileSync(resolve(__dirname, '../../components/v2/EtatZone.svelte'), 'utf8');
    const styles = chip.slice(chip.indexOf('<style>'));
    expect(styles).toContain('color:var(--tune-success)');
    expect(styles).toContain('color:var(--tune-warning)');
    // Un seul `--v2-acc*` dans cette pastille et l'information redeviendrait
    // invisible sur un thème vert ou ambre.
    expect(styles).not.toMatch(/--v2-acc/);
    // La FORME porte l'état : trois dessins distincts, pas trois couleurs.
    expect(chip).toContain('class="barres"');
    expect(chip).toMatch(/prefers-reduced-motion/);
  });

  it('montre l’état sur la carte ET sur la ligne de liste', async () => {
    await open();
    const enGrille = [...host.querySelectorAll('.grille .ez .lbl')].map((e) => e.textContent);
    expect(enGrille).toEqual([fr['zone.playing'], fr['zone.paused'], fr['zone.stopped']]);
    host.querySelector<HTMLButtonElement>(`.bascule button[title="${fr['v2.zones.viewList']}"]`)!.click();
    await settle();
    const enListe = [...host.querySelectorAll('.list .ez .lbl')].map((e) => e.textContent);
    expect(enListe).toEqual([fr['zone.playing'], fr['zone.paused'], fr['zone.stopped']]);
  });
});

describe('la vignette de la carte', () => {
  it('🔴 n’est JAMAIS vide : pochette, sinon icône de type de sortie', async () => {
    await open();
    const cartes = host.querySelectorAll('.grille .carte');
    expect(cartes.length).toBe(3);
    for (const c of cartes) {
      const aQuelqueChose = c.querySelector('.cpoch .album-art') || c.querySelector('.cpoch .cvide');
      expect(aQuelqueChose, 'une carte sans aucune vignette').not.toBeNull();
    }
    // Les deux zones qui ne jouent rien retombent sur le pictogramme.
    expect(host.querySelectorAll('.grille .cvide').length).toBe(2);
  });

  it('le repli ACTIVE la zone — il n’a aucune lecture à ouvrir', async () => {
    await open();
    const repli = host.querySelector<HTMLButtonElement>('.grille .crepli')!;
    expect(repli.getAttribute('aria-label')).toBe('Activer Chambre');
    repli.click();
    await settle();
    expect(host.querySelector('.grille')).not.toBeNull();
  });
});
