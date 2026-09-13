import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nowPlayingToTrack } from '../stores/nowPlaying';

const source = readFileSync(
  resolve(__dirname, '../../components/NowPlaying.svelte'),
  'utf-8',
);

describe('contrat d’identifiant du lecteur (#2430)', () => {
  it('rétablit id depuis la forme track_id renvoyée par GET /zones', () => {
    const track = nowPlayingToTrack({
      track_id: 42,
      title: 'Deuxième piste',
      source: 'local',
    } as any);

    expect(track.id).toBe(42);
  });

  it('emploie la piste normalisée pour les commandes qui exigent cet id', () => {
    const actionsStart = source.indexOf('<div class="np-extra-btns">');
    const actionsEnd = source.indexOf('</div>', source.indexOf('class="np-alarm-panel"'));
    const actions = source.slice(actionsStart, actionsEnd);

    expect(actionsStart).toBeGreaterThanOrEqual(0);
    expect(actionsEnd).toBeGreaterThan(actionsStart);
    // TROIS gardes, qui exigent toutes une piste identifiée et partagent le
    // même contrat : le groupe crédits/paroles, le partage, et — depuis #975 —
    // le PANNEAU des crédits, sorti de la rangée de boutons.
    //
    // 🔴 La troisième n'est pas une garde de plus, c'est la MÊME déplacée : le
    // panneau vivait à l'intérieur du groupe crédits/paroles et en héritait.
    // L'en sortir sans la reprendre aurait affiché des crédits sur une radio.
    // Le compte monte donc de 2 à 3 sans qu'aucun bouton ne change de règle.
    //
    // Elles étaient trois avant #534 : le panneau du Réveil portait la même
    // garde. Elle en a été retirée, parce que le réveil est un réglage de ZONE
    // (`api.setAlarm(zone.id, …)`) et que la garde le rendait introuvable sur
    // une radio. Ce test compte les gardes RESTANTES ; ce qu'il protège est
    // inchangé : celles qui restent lisent la piste NORMALISÉE, jamais
    // `displayTrack.id` (l'assertion suivante).
    expect(actions.match(/!isRadio && normalizedTrack\?\.id != null/g)).toHaveLength(3);
    expect(actions).toContain('loadNpCredits(normalizedTrack.id)');
    expect(actions).not.toMatch(/displayTrack\??\.id/);
  });

  it('normalise aussi préchargement, favoris et compteur d’écoutes', () => {
    const autoLoadStart = source.indexOf('// Auto-load credits and lyrics');
    const autoLoadEnd = source.indexOf('// Compact inline credits summary', autoLoadStart);
    const autoLoad = source.slice(autoLoadStart, autoLoadEnd);
    const playsStart = source.indexOf('// Play count for the current local track');
    const playsEnd = source.indexOf('// Zone playing OR', playsStart);
    const plays = source.slice(playsStart, playsEnd);

    expect(autoLoad).toContain('const tr = normalizedTrack');
    expect(autoLoad).toContain('const id = tr?.id ?? null');
    expect(autoLoad).not.toContain('displayTrack.id');
    expect(plays).toContain('const dt = normalizedTrack');
    expect(plays).toContain('normalizedTrack?.id === id');
  });
});
