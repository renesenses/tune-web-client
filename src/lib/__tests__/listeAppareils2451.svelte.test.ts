// @vitest-environment jsdom
//
// web#2451 (alec_eiffel, fil 2424) — l'onglet Appareils listait toutes les
// zones à la suite, chacune avec ses détails. Attendu : une liste compacte
// (nom, protocole, état), triée de façon stable, filtrable par texte et par
// type ; les détails s'ouvrent au clic.
//
// Contre-épreuve : sans le filtre de type, sans `aria-expanded` ou sans le tri,
// les tests 🔴 correspondants tombent (voir la PR).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ListeAppareils from '../../components/v2/ListeAppareils.svelte';
import { cleZone, trierZones, filtrerZones, typesPresents, etatAppareil, TYPE_LOCAL } from '../listeAppareils';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const ZONES: any[] = [
  { id: 3, name: 'Salon', output_type: 'dlna', online: true, state: 'playing', brand: 'Eversolo', model: 'DMP-A6' },
  { id: 1, name: 'cuisine', output_type: 'airplay2', online: true, state: 'stopped' },
  { id: 2, name: 'Bureau', output_type: 'local', online: true, state: 'paused' },
  { id: 4, name: 'Étage', output_type: 'dlna', online: false, state: 'playing' },
];

describe('logique pure', () => {
  it('🔴 tri stable, insensible à la casse, quel que soit l\'ordre du serveur', () => {
    const a = trierZones(ZONES).map((z) => z.name);
    const b = trierZones([...ZONES].reverse()).map((z) => z.name);
    expect(a).toEqual(['Bureau', 'cuisine', 'Étage', 'Salon']);
    expect(b).toEqual(a);
  });
  it('🔴 les homonymes gardent un ordre fixe (par id)', () => {
    const h = [{ id: 9, name: 'Salon' }, { id: 5, name: 'Salon' }];
    expect(trierZones(h).map((z) => z.id)).toEqual([5, 9]);
    expect(trierZones([...h].reverse()).map((z) => z.id)).toEqual([5, 9]);
  });
  it('filtre texte : nom, appareil, protocole ; sans accents ni casse', () => {
    expect(filtrerZones(ZONES, 'etage', '').map((z) => z.id)).toEqual([4]);
    expect(filtrerZones(ZONES, 'eversolo', '').map((z) => z.id)).toEqual([3]);
    expect(filtrerZones(ZONES, 'airplay', '').map((z) => z.id)).toEqual([1]);
    expect(filtrerZones(ZONES, 'zzz', '')).toEqual([]);
  });
  it('🔴 filtre de type, y compris local', () => {
    expect(filtrerZones(ZONES, '', 'DLNA').map((z) => z.id)).toEqual([3, 4]);
    expect(filtrerZones(ZONES, '', TYPE_LOCAL).map((z) => z.id)).toEqual([2]);
    expect(typesPresents(ZONES)).toEqual([TYPE_LOCAL, 'AirPlay', 'DLNA']);
  });
  it('état : hors ligne l\'emporte sur « lecture »', () => {
    expect(etatAppareil(ZONES[3])).toBe('offline');
    expect(etatAppareil(ZONES[0])).toBe('playing');
    expect(etatAppareil(ZONES[2])).toBe('paused');
    expect(etatAppareil(ZONES[1])).toBe('stopped');
  });
});

const hotes: HTMLElement[] = [];
const montes: ReturnType<typeof mount>[] = [];
beforeEach(() => locale.set('fr'));
afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
});

function poser(ouverte: string | null = null) {
  const choix: (string | null)[] = [];
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(ListeAppareils, {
    target: hote,
    props: { zones: ZONES, ouverte, onselect: (c: string | null) => choix.push(c) },
  }));
  flushSync();
  return { hote, choix };
}
const lignes = (h: HTMLElement) => [...h.querySelectorAll<HTMLButtonElement>('button.ligne')];

describe('liste compacte', () => {
  it('🔴 une ligne par zone, triée, avec nom, protocole et état', () => {
    const { hote } = poser();
    const l = lignes(hote);
    expect(l.map((b) => b.querySelector('.zn')!.textContent)).toEqual(['Bureau', 'cuisine', 'Étage', 'Salon']);
    expect(l[3].textContent).toContain('DLNA');
    expect(l[3].textContent).toContain('Eversolo DMP-A6');
    expect(l[3].textContent).toContain('Lecture');
    expect(l[2].textContent).toContain('Hors ligne');
    expect(l[0].textContent).toContain('sortie locale');
  });
  it('aucun détail dans la liste : ni réglage ni case à cocher', () => {
    const { hote } = poser();
    expect(hote.querySelectorAll('input[type=checkbox], input[type=range], select.sel').length).toBe(0);
  });
  it('🔴 le clic demande l\'ouverture ; un second clic sur l\'ouverte la ferme', () => {
    const a = poser();
    lignes(a.hote)[3].click();
    expect(a.choix).toEqual([cleZone(ZONES[0])]);
    const b = poser(cleZone(ZONES[0]));
    const ouverte = lignes(b.hote)[3];
    expect(ouverte.getAttribute('aria-expanded')).toBe('true');
    expect(ouverte.getAttribute('aria-controls')).toBe('zc-3');
    ouverte.click();
    expect(b.choix).toEqual([null]);
    expect(lignes(b.hote)[0].getAttribute('aria-expanded')).toBe('false');
  });
  it('🔴 le filtre texte réduit la liste et le compteur le dit', () => {
    const { hote } = poser();
    const champ = hote.querySelector<HTMLInputElement>('input[type=search]')!;
    champ.value = 'sal';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(lignes(hote).length).toBe(1);
    expect(hote.querySelector('.la-n')!.textContent!.trim()).toBe('1 sur 4');
    champ.value = 'zzz';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(lignes(hote).length).toBe(0);
    expect(hote.textContent).toContain('Aucun appareil ne correspond au filtre.');
  });
  it('🔴 le filtre de type réduit la liste', () => {
    const { hote } = poser();
    const sel = hote.querySelector<HTMLSelectElement>('select.la-type')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Tous les types', 'sortie locale', 'AirPlay', 'DLNA']);
    sel.value = 'DLNA';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(lignes(hote).map((b) => b.querySelector('.zn')!.textContent)).toEqual(['Étage', 'Salon']);
  });
  it('🔴 clavier : les flèches déplacent le focus, Début/Fin aux extrémités', () => {
    const { hote } = poser();
    document.body.appendChild(hote);
    const l = lignes(hote);
    l[0].focus();
    const presse = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    presse('ArrowDown');
    expect(document.activeElement).toBe(l[1]);
    presse('End');
    expect(document.activeElement).toBe(l[3]);
    presse('ArrowDown');
    expect(document.activeElement).toBe(l[3]);
    presse('Home');
    expect(document.activeElement).toBe(l[0]);
  });
  it('rôles et libellés : liste nommée, champs étiquetés', () => {
    const { hote } = poser();
    expect(hote.querySelector('ul')!.getAttribute('aria-label')).toBe('Appareils et zones');
    expect(hote.querySelector('input[type=search]')!.getAttribute('aria-label')).toBe('Filtrer les appareils');
    expect(hote.querySelector('select')!.getAttribute('aria-label')).toBe('Type de sortie');
    expect(hote.querySelectorAll('li > button').length).toBe(4);
  });
});

describe('câblage dans les Réglages', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
  const debut = src.indexOf("{:else if s.id === 'perZone'}");
  const fin = src.indexOf("{:else if s.id === 'clap'}", debut);
  const bloc = src.slice(debut, fin);
  it('🔴 la section monte la liste compacte et n\'affiche que la carte ouverte', () => {
    expect(bloc).toContain('<ListeAppareils');
    expect(bloc).toMatch(/\{#if cleZone\(z\) === zoneOuverte\}\s*<div class="zc"/);
  });
  it('🔴 une cible de zone (roue crantée, FIR) ouvre la carte visée', () => {
    expect(src).toMatch(/if \(target\.zone != null\) zoneOuverte = cleZone\(/);
  });
  it('aucune action existante perdue : tout y est encore', () => {
    for (const x of ['<CorrectionAcoustiqueZone', '<ZoneDeviceEditor', '<RendererConfig', 'choisirImageZone(z)',
      'askFixedVolume(z', 'updateZoneUpnpRenderer', 'updateZoneGainTrim', 'updateZoneChannelLayout']) {
      expect(bloc, x).toContain(x);
    }
  });
  it('🔴 les 9 clés existent dans les 15 langues', () => {
    const cles = ['listAria', 'filterLabel', 'filterPlaceholder', 'typeLabel', 'typeAll', 'count', 'noMatch', 'detailTitle', 'pickHint'];
    expect(ONZE_LANGUES.length).toBeGreaterThanOrEqual(11);
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const f = readFileSync(resolve(process.cwd(), `src/lib/locales/${l}.ts`), 'utf-8');
      for (const c of cles) expect(f, `${l} ${c}`).toContain(`"v2.dev.${c}":`);
    }
    expect(dictionnaire('fr')['v2.dev.count']).toContain('{shown}');
  });
});
