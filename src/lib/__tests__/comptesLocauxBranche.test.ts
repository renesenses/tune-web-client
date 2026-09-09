// « Ecrit mais pas branche » — la moitie qui manque le plus souvent.
//
// Le serveur sert `tracks_local` / `tracks_by_source` depuis #3277 (03/09).
// Mesure du 09/09 sur `main` du client : ZERO occurrence de ces champs dans
// tout `src/`. La ventilation existait, aucun ecran ne la lisait, et le
// testeur voyait toujours les deux nombres inexplicables cote a cote —
// `{stats.tracks}` et `{scanReport.total_files}` sur le meme onglet.
//
// `comptesLocaux.test.ts` prouve que la brique sait decider. Ce fichier-ci
// prouve que l'ECRAN l'appelle : sans lui, le meme defaut se reproduit a
// l'identique.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ECRAN = readFileSync(
  join(process.cwd(), 'src/components/SettingsView.svelte'),
  'utf8',
);

describe('la ventilation par source est branchee sur l ecran Bibliotheque', () => {
  it('SettingsView importe le decideur', () => {
    expect(ECRAN).toContain("from '../lib/comptesLocaux'");
  });

  it('SettingsView derive les deux comptes locaux des stats du serveur', () => {
    expect(ECRAN).toContain('stats?.tracks_local');
    expect(ECRAN).toContain('stats?.albums_local');
  });

  it('SettingsView rend le compte local a cote du total', () => {
    expect(ECRAN).toContain('{pistesLocales}');
    expect(ECRAN).toContain('{albumsLocaux}');
  });

  it("le total, lui, reste affiche — on nomme les populations, on n'en cache aucune", () => {
    expect(ECRAN).toContain('{stats.tracks}');
    expect(ECRAN).toContain('{stats.albums}');
  });
});
