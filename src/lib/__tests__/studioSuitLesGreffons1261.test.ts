import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import {
  entreeStudioVisible,
  entreesStudioVisibles,
  etatGreffons,
  publierGreffons,
  rafraichirGreffons,
} from '../stores/greffonsStudio';

// #1261 — Bertrand, .18 en v0.9.156 : les greffons crossfeed/converter/declick
// désactivés, l'égaliseur désinstallé, et la section STUDIO les montrait tous.
const STUDIO = [
  { view: 'equalizer' },
  { view: 'crossfeed' },
  { view: 'converter' },
  { view: 'declick' },
  { view: 'alarms' },
  { view: 'metadata' },
  { view: 'diagnostics' },
];

const g = (name: string, champs: Record<string, unknown>) => ({ name, ...champs }) as any;

// L'état exact relevé sur le .18 le 19/09/2026 (GET /api/v1/plugins).
const ETAT_DU_18 = {
  equalizer: g('equalizer', { installed: false, enabled: false, install_proposed: false }),
  crossfeed: g('crossfeed', { installed: true, enabled: false }),
  converter: g('converter', { installed: true, enabled: false }),
  declick: g('declick', { installed: true, enabled: false }),
};

const vues = (items: { view: string }[]) => items.map((i) => i.view);

describe('#1261 — la section STUDIO suit l’état réel des greffons', () => {
  beforeEach(() => etatGreffons.set(null));

  it('🔴 greffons désinstallés ou désactivés : leurs entrées disparaissent, les outils restent', () => {
    expect(vues(entreesStudioVisibles(STUDIO, ETAT_DU_18))).toEqual(['alarms', 'metadata', 'diagnostics']);
  });

  it('installé ET actif : l’entrée est là', () => {
    const etat = { ...ETAT_DU_18, crossfeed: g('crossfeed', { installed: true, enabled: true }) };
    expect(vues(entreesStudioVisibles(STUDIO, etat))).toContain('crossfeed');
  });

  it('égaliseur non installé mais réglé (install_proposed) : l’entrée reste — son écran propose l’installation', () => {
    const etat = { ...ETAT_DU_18, equalizer: g('equalizer', { installed: false, install_proposed: true }) };
    expect(vues(entreesStudioVisibles(STUDIO, etat))).toContain('equalizer');
  });

  it('vieux serveur (champ installed absent) ou greffon absent de la liste : on montre, comme avant', () => {
    expect(entreeStudioVisible(undefined)).toBe(true);
    expect(entreeStudioVisible(g('crossfeed', {}))).toBe(true);
  });

  it('état inconnu (première lecture pas encore revenue) : rien n’est masqué', () => {
    expect(vues(entreesStudioVisibles(STUDIO, null))).toEqual(vues(STUDIO));
  });

  it('l’écran Extensions republie : un geste là-bas change la barre sans recharger', () => {
    publierGreffons(Object.values(ETAT_DU_18));
    expect(vues(entreesStudioVisibles(STUDIO, get(etatGreffons)))).not.toContain('crossfeed');
    publierGreffons([...Object.values(ETAT_DU_18), g('crossfeed', { installed: true, enabled: true })]);
    expect(vues(entreesStudioVisibles(STUDIO, get(etatGreffons)))).toContain('crossfeed');
  });

  it('une panne de lecture ne vide pas la barre', async () => {
    publierGreffons(Object.values(ETAT_DU_18));
    const avant = get(etatGreffons);
    await rafraichirGreffons(() => Promise.reject(new Error('503')));
    expect(get(etatGreffons)).toBe(avant);
  });

  it('🔴 la barre et l’écran Extensions sont branchés sur ce filtre', () => {
    const barre = readFileSync('src/components/v2/Sidebar.svelte', 'utf-8');
    expect(barre).toMatch(/\{#each studioVisible as it/);
    expect(barre).not.toMatch(/\{#each STUDIO as it/);
    const ext = readFileSync('src/components/v2/PluginsV2.svelte', 'utf-8');
    expect(ext).toMatch(/publierGreffons\(plugins\)/);
  });
});
