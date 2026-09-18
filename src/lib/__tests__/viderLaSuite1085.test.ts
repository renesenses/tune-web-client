// @vitest-environment jsdom
/**
 * #1085 — « Vider la suite », le geste qui manquait entre « Vider » et retirer
 * les pistes une par une.
 *
 * Contrat serveur, tune-server-rust#4169, livré en v0.9.155 :
 * `POST /zones/{id}/queue/clear` avec `{"keep_current": true}` retire ce qui
 * suit le curseur, garde la piste en cours et sa position, n'arrête rien, et
 * émet `playback.queue.cleared` avec `keep_current: true`.
 *
 * 🔴 Le piège est là : les DEUX gestes émettent le même événement. Le client
 * le traitait d'une seule façon — piste courante effacée, zone passée à
 * « arrêté » — ce qui aurait montré une lecture arrêtée alors qu'elle continue.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
// Import STATIQUE, et c'est délibéré : un `await import('../api')` DANS le
// test mettait ~4 s sous la charge de la suite complète et dépassait le délai
// de 5 s — vert seul, rouge en lot.
import * as api from '../api';

describe('#1085 — la requête', () => {
  it('sans argument, le corps reste ABSENT — la forme d\'avant, inchangée', async () => {
    const src = readFileSync('src/lib/api.ts', 'utf8');
    const i = src.indexOf('export function clearQueue(');
    expect(i).toBeGreaterThan(0);
    const bloc = src.slice(i, src.indexOf('\n}', i));
    expect(bloc).toContain('keepCurrent = false');
    expect(bloc).toContain("JSON.stringify({ keep_current: true })");
    // Contre-épreuve : on n'envoie PAS `keep_current: false`, qui changerait
    // la requête d'un geste qui n'a pas changé (en-tête `Content-Type`).
    expect(bloc).not.toContain('keep_current: false');
  });

  it('l\'appel passe bien le drapeau', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    await api.clearQueue(7, true);
    await api.clearQueue(7);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, init1] = fetchSpy.mock.calls[0] as any;
    const [, init2] = fetchSpy.mock.calls[1] as any;
    expect(JSON.parse(init1.body)).toEqual({ keep_current: true });
    expect(init2.body).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe('#1085 — l\'écran', () => {
  const vue = readFileSync('src/components/v2/QueueV2.svelte', 'utf8');

  it('le bouton existe et appelle le bon geste', () => {
    expect(vue).toContain('api.clearQueue($currentZoneId!, true)');
    expect(vue).toContain("v2.queue.clearUpNext");
  });

  it('🔴 il ne s\'affiche QUE s\'il reste quelque chose après la piste en cours', () => {
    const i = vue.indexOf('viderLaSuite}');
    expect(i).toBeGreaterThan(0);
    // Le bloc conditionnel qui l'entoure porte sur `upNext`, pas sur `tracks` :
    // sur la dernière piste, le bouton n'aurait rien à retirer.
    const avant = vue.slice(0, i);
    const garde = avant.lastIndexOf('{#if ');
    expect(avant.slice(garde)).toContain('upNext.length');
    expect(avant.slice(garde)).not.toContain('tracks.length');
  });

  it('le geste « Vider » d\'origine est intact', () => {
    expect(vue).toContain('const clear = () => act(() => api.clearQueue($currentZoneId!));');
  });
});

describe('#1085 — l\'événement, qui est le même pour les deux gestes', () => {
  const app = readFileSync('src/App.svelte', 'utf8');

  it('🔴 `keep_current` a sa propre branche, AVANT celle qui arrête tout', () => {
    const iGarde = app.indexOf("type === 'playback.queue.cleared' && event.data?.keep_current");
    const iArret = app.indexOf("type === 'playback.queue.cleared') {");
    expect(iGarde).toBeGreaterThan(0);
    expect(iArret).toBeGreaterThan(iGarde);
  });

  it('cette branche recharge la file et ne remet RIEN à zéro', () => {
    const i = app.indexOf("event.data?.keep_current");
    const j = app.indexOf("type === 'playback.queue.cleared') {", i);
    const bloc = app.slice(i, j);
    expect(bloc).toContain('fetchQueue()');
    expect(bloc).toContain('syncZoneState(zoneId)');
    // Contre-épreuve : aucune des trois remises à zéro de l'autre branche.
    expect(bloc).not.toContain("state: 'stopped'");
    expect(bloc).not.toContain('current_track: null');
    expect(bloc).not.toContain('queueTracks.set([])');
  });

  it('la branche d\'arrêt, elle, garde ses remises à zéro', () => {
    const i = app.indexOf("type === 'playback.queue.cleared') {");
    const bloc = app.slice(i, i + 1800);
    expect(bloc).toContain("state: 'stopped'");
    expect(bloc).toContain('queueTracks.set([])');
  });
});
