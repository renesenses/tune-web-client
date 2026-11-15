// @vitest-environment jsdom
/**
 * Accueil — maquette de Levente « Home Dashboard with Album Grid » (Figma
 * 612:5808), go de Bertrand du 15/11/2026.
 *
 * Ce banc tient ce que la maquette change, et ce qu'elle ne doit PAS changer :
 *   1. le panneau « Zones » liste TOUTES les zones, actives d'abord, avec le
 *      nombre de zones actives et un bouton lecture/pause qui vise LA zone ;
 *   2. décoché, les cartes carrées reviennent (rien ne disparaît) ;
 *   3. « 2026 · Jazz » sous un album vient de l'objet, jamais d'une invention ;
 *   4. la variante visuelle est posée sur l'ACCUEIL seul.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PanneauZones from '../../components/v2/ligne1/PanneauZones.svelte';
import { zones } from '../stores/zones';
import { locale } from '../i18n';
import { nbZonesActives, zonesDuPanneau, PANNEAUX_L1, panneauxDeLaLigne } from '../premiereLigne';
import { detailsAlbum, versElement } from '../accueilWidgets';
import type { Zone } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const Z = (id: number, name: string, state: string, titre?: string): Zone =>
  ({
    id, name, state,
    current_track: titre ? { title: titre, artist_name: 'Nora Vale', source: 'local', track_id: id * 10 } : null,
  }) as unknown as Zone;

describe('les zones du panneau', () => {
  const liste = [Z(1, 'Salon', 'stopped'), Z(2, 'Bureau', 'playing', 'Lumen'), Z(3, 'Cuisine', 'paused', 'Solace'), { id: null, name: 'x' } as any];

  it('toutes les zones pilotables, actives en tête, ordre du serveur conservé', () => {
    expect(zonesDuPanneau(liste).map((z) => z.name)).toEqual(['Bureau', 'Cuisine', 'Salon']);
  });

  it('compte les zones qui jouent OU sont en pause', () => {
    expect(nbZonesActives(liste)).toBe(2);
    expect(nbZonesActives(null)).toBe(0);
  });

  it('le panneau « Zones » ouvre la ligne par défaut, et une préférence ancienne le laisse décoché', () => {
    expect(PANNEAUX_L1[0].id).toBe('zones');
    expect(panneauxDeLaLigne(undefined)[0]).toBe('zones');
    // Qui a déjà enregistré son choix garde ses cartes : rien ne change sans lui.
    expect(panneauxDeLaLigne(['genres', 'concerts', 'stats'])).not.toContain('zones');
  });
});

describe('le panneau monté', () => {
  let hote: HTMLDivElement;
  let monte: ReturnType<typeof mount> | null = null;
  let appels: string[] = [];

  beforeEach(() => {
    locale.set('fr');
    appels = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://tune.test');
      if (init?.method === 'POST' || init?.method === 'PUT') appels.push(u.pathname);
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({}), text: async () => '{}',
      } as unknown as Response;
    }));
    zones.set([Z(1, 'Salon', 'stopped'), Z(2, 'Bureau', 'playing', 'Lumen'), Z(3, 'Cuisine', 'paused', 'Solace')]);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PanneauZones, { target: hote });
    flushSync();
  });

  afterEach(async () => {
    if (monte) await unmount(monte);
    monte = null;
    hote.remove();
    zones.set([]);
    vi.unstubAllGlobals();
  });

  it('une ligne par zone, le titre et l’artiste sous le nom, la pastille des actives', () => {
    const noms = [...hote.querySelectorAll('li .nom')].map((e) => e.textContent);
    expect(noms).toEqual(['Bureau', 'Cuisine', 'Salon']);
    expect(hote.querySelector('li .sous')?.textContent).toBe('Lumen — Nora Vale');
    expect(hote.querySelector('[data-zones-actives]')?.textContent).toBe('2 actives');
    expect(hote.textContent).toContain('Gérer les zones');
  });

  it('pas de bouton lecture sur une zone sans piste — il ne saurait quoi jouer', () => {
    const lignes = [...hote.querySelectorAll('li')];
    expect(lignes[2].querySelector('.galet')).toBeNull();
    expect(lignes[0].querySelector('.galet')).not.toBeNull();
  });

  it('le bouton met en pause LA zone de sa ligne', async () => {
    hote.querySelector<HTMLButtonElement>('li .galet')!.click();
    await tick(); await new Promise((r) => setTimeout(r, 20));
    expect(appels.some((p) => /\/zones\/2\/pause$/.test(p)), appels.join(', ')).toBe(true);
    expect(appels.some((p) => /\/zones\/3\//.test(p))).toBe(false);
  });

  it('aucune zone active : pas de pastille « 0 actives »', async () => {
    zones.set([Z(1, 'Salon', 'stopped')]);
    flushSync();
    expect(hote.querySelector('[data-zones-actives]')).toBeNull();
  });
});

describe('« 2026 · Jazz » sous la vignette', () => {
  it('l’année et le genre quand l’objet les porte', () => {
    expect(detailsAlbum({ year: 2026, genre: 'Jazz' })).toBe('2026 · Jazz');
    expect(detailsAlbum({ release_date: '2025-03-14', genres: [{ name: 'Ambient' }] })).toBe('2025 · Ambient');
    expect(detailsAlbum({ genres: ['Indie'] })).toBe('Indie');
  });

  it('rien d’inventé : ni zéro, ni genre vide', () => {
    expect(detailsAlbum({})).toBeNull();
    expect(detailsAlbum({ year: 0, genre: '  ' })).toBeNull();
    expect(detailsAlbum(null)).toBeNull();
  });

  it('versElement le pose sur un album, pas sur une playlist', () => {
    expect(versElement({ id: 1, title: 'Lumen', year: 2026, genre: 'Indie' }, 0, 'alb').details).toBe('2026 · Indie');
    expect(versElement({ id: 1, title: 'Mix', year: 2026 }, 0, 'pl', { genre: 'playlist' }).details).toBeNull();
  });
});

describe('la variante visuelle est celle de l’ACCUEIL seul', () => {
  const src = lire('src/components/v2/PageWidgets.svelte');

  it('posée par `salut`, que seul l’accueil passe', () => {
    expect(src).toContain('class:accueil={salut}');
    expect(lire('src/components/v2/HomeV2.svelte')).toContain('<PageWidgets salut');
  });

  it('la ligne d’année et de genre ne s’affiche que sur l’accueil', () => {
    expect(src).toContain('{#if salut && el.details}');
  });

  it('décoché, le panneau « Zones » rend les cartes carrées', () => {
    const i = src.indexOf("{#if panneaux.includes('zones')}");
    expect(i).toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 400);
    expect(bloc).toContain('<PanneauZones />');
    expect(bloc).toMatch(/\{:else\}[\s\S]*<CarteZoneL1 zone=\{z\} \/>/);
  });
});
