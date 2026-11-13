// @vitest-environment jsdom
//
// web#2966 — recette rc12 sur le .18 (13/11/2026) : Collections › « + Nouvelle
// ▾ » › « Suggérée par l'IA » ne faisait RIEN. Journal du serveur :
// `api_not_found path=/api/v1/ext/assistant-ia/collections/proposer` (×5) ;
// le greffon y est dormant (`plugin_dormant_not_loaded … opt_in=false`), ses
// routes ne sont pas montées. Le 404 générique de l'API
// (`{"error":"not found","path":…}`, sans `ok`) n'était ni un échec reconnu
// ni une réponse : l'écran se taisait.
//
// Désormais tout appel à `/ext/assistant-ia/*` passe par `appelIa`, qui en
// fait l'échec nommé `assistant_inactif`, et chaque fenêtre de l'assistant
// le dit, avec le lien vers Réglages › Extensions et la clé à renseigner.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import PropositionsCollectionsIaV2 from '../../components/v2/PropositionsCollectionsIaV2.svelte';
import PlaylistParPhraseV2 from '../../components/v2/PlaylistParPhraseV2.svelte';
import { locale } from '../i18n';
import { assistantAbsent, assistantIaAbsent, cleDEchec, estEchec, lireReglagesIa } from '../assistantIa';
import { proposerCollectionsIa } from '../assistantIaRc8';
import { sonderAssistantIa } from '../assistantIaDialogue';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';

/** Ce que rend le serveur Rust pour une route que rien ne monte. */
const ROUTE_ABSENTE = { status: 404, corps: { error: 'not found', path: '/api/v1/ext/assistant-ia/collections/proposer' } };
let reponse: { status: number; corps: unknown } = ROUTE_ABSENTE;
let appels: string[] = [];

beforeEach(() => {
  locale.set('fr');
  appels = [];
  reponse = ROUTE_ABSENTE;
  assistantIaAbsent.set(false);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    appels.push(new URL(String(url), window.location.href).pathname);
    return new Response(JSON.stringify(reponse.corps), { status: reponse.status, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  assistantIaAbsent.set(false);
  v2SettingsTarget.set(null);
});

async function stabiliser() {
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

describe('web#2966 — le 404 de route absente devient « assistant inactif »', () => {
  it('reconnaît le 404 générique, et lui seul', () => {
    expect(assistantAbsent(ROUTE_ABSENTE.corps)).toBe(true);
    expect(assistantAbsent(null)).toBe(true);
    expect(assistantAbsent({ ok: false, error: 'non_configure', message: '' })).toBe(false);
    expect(assistantAbsent({ ok: true, collections: [] })).toBe(false);
    // Les réglages n'ont pas de champ `ok` : ce ne sont pas pour autant un 404.
    expect(assistantAbsent({ plafond_eur: 2, consommation: {} })).toBe(false);
    expect(assistantAbsent([])).toBe(false);
  });

  it('proposerCollectionsIa rend l’échec nommé, et l’état est noté', async () => {
    const r = await proposerCollectionsIa({ langue: 'fr' });
    expect(appels).toEqual(['/api/v1/ext/assistant-ia/collections/proposer']);
    expect(estEchec(r)).toBe(true);
    expect((r as { error: string }).error).toBe('assistant_inactif');
    expect(cleDEchec('assistant_inactif')).toBe('assistantIa.err.assistant_inactif');
    expect(get(assistantIaAbsent)).toBe(true);
  });

  it('une réponse du greffon (même un échec fonctionnel) l’éteint', async () => {
    assistantIaAbsent.set(true);
    reponse = { status: 400, corps: { ok: false, error: 'non_configure', message: 'x' } };
    const r = await lireReglagesIa();
    expect((r as { error: string }).error).toBe('non_configure');
    expect(get(assistantIaAbsent)).toBe(false);
  });

  it('la sonde du démarrage lit le 404 au lieu de le lever', async () => {
    await sonderAssistantIa();
    expect(get(assistantIaAbsent)).toBe(true);
  });

  it('plus aucun appel à /ext/assistant-ia/* ne contourne appelIa', () => {
    for (const f of ['assistantIa.ts', 'assistantIaRc8.ts']) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
      expect(src.match(/fetchJSON\(\s*`\$\{RACINE\}/g), f).toBeNull();
    }
    // Hors de ces deux modules, seule la sonde (`assistantIaDialogue`) lit la route.
    const lib = readdirSync(resolve(__dirname, '..')).filter((f) => f.endsWith('.ts'));
    const fautifs = lib.filter((f) => !['assistantIa.ts', 'assistantIaRc8.ts', 'assistantIaDialogue.ts'].includes(f)
      && readFileSync(resolve(__dirname, '..', f), 'utf8').includes('/ext/assistant-ia'));
    expect(fautifs).toEqual([]);
  });
});

describe('web#2966 — « Suggérée par l’IA » ne se tait plus', () => {
  it('Proposer : le message, la clé à fournir, et le lien vers Extensions', async () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const fermer = vi.fn();
    const c = mount(PropositionsCollectionsIaV2, { target: hote, props: { onClose: fermer, onCreee: () => {} } });
    flushSync();
    hote.ownerDocument.querySelector<HTMLButtonElement>('[data-coll-proposer]')!.click();
    await stabiliser();
    const note = document.querySelector<HTMLElement>('[data-propositions-collections-ia] [data-assistant-ia-inactif]');
    expect(note, 'échec muet : rien n’est dit après le 404').not.toBeNull();
    expect(note!.textContent).toContain('L\'assistant IA n\'est pas activé sur ce serveur.');
    expect(note!.textContent).toContain('Réglages › Extensions');
    expect(note!.textContent).toContain('clé d\'un fournisseur IA');
    // Une seule voix : pas de seconde alerte qui répète la même phrase.
    expect(document.querySelectorAll('[data-propositions-collections-ia] [role="alert"]')).toHaveLength(1);
    activeView.set('collections' as any);
    note!.querySelector<HTMLButtonElement>('[data-ouvrir-extensions]')!.click();
    expect(get(v2SettingsTarget)).toEqual({ tab: 'extensions', section: 'plugins' });
    expect(get(activeView)).toBe('settings');
    expect(fermer).toHaveBeenCalled();
    unmount(c);
    hote.remove();
  });

  it('greffon déjà connu comme absent : dit dès l’ouverture, avant tout geste', async () => {
    assistantIaAbsent.set(true);
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const c = mount(PlaylistParPhraseV2, { target: hote, props: { onClose: () => {}, onPropose: () => {} } });
    flushSync();
    expect(document.querySelector('[data-assistant-ia-inactif]')).not.toBeNull();
    expect(appels).toEqual([]);
    unmount(c);
    hote.remove();
  });

  it('toutes les fenêtres de l’assistant portent le message', () => {
    for (const f of ['PropositionsCollectionsIaV2', 'PourquoiAlbumIaV2', 'CollectionIaV2', 'DiagnosticIaV2',
      'NotesPochetteIaV2', 'SuggestionsIaAlbumV2', 'SuggestionsIaLotV2', 'PlaylistParPhraseV2', 'AssistantIaReglagesV2']) {
      const src = readFileSync(resolve(__dirname, `../../components/v2/${f}.svelte`), 'utf8');
      expect(src, f).toContain('<AssistantIaInactifV2');
    }
  });
});
