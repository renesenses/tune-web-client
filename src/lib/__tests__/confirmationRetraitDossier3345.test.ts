/**
 * Retirer un dossier : la confirmation pose sa question À LA FIN (#3345,
 * fil 2609).
 *
 * Défaut constaté : la boîte disait « Le dossier a été retiré. N pistes […]
 * Les retirer aussi de la bibliothèque ? » PUIS ce qui partirait (playlists,
 * favoris, file d'attente) et que les fichiers ne bougent pas. Le testeur a
 * lu ce « point d'interrogation au milieu » comme ambigu : on lui demandait
 * de répondre avant de lui dire ce que la réponse emporterait.
 *
 * Le banc passe par `retirerUnDossier`, le geste réel des Réglages et de
 * l'assistant, et lit le message que reçoit `dialogs.confirm` : c'est
 * exactement le texte affiché. Il vérifie l'ordre dans les vingt langues.
 */
import { describe, expect, it } from 'vitest';
import { retirerUnDossier } from '../ajoutDossier';
import type { RetraitDossier } from '../purgeOrphelines';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import { formaterPluriel } from '../pluriel';

const ANNONCE: RetraitDossier = {
  dirs: ['/media/musique'],
  orphan_tracks: 1240,
  confirm_purge_required: 1240,
  impact: { tracks: 1240, playlists: 3, playlist_entries: 87, favorites: 12, history_entries: 430, queue_entries: 2 },
};

function remplir(modele: string, langue = 'fr'): string {
  // rc14 (point 10) — les phrases comptées sont au format ICU : la forme
  // retenue est celle de 1240 dans la langue (`many` en polonais, `other`…).
  return formaterPluriel(modele, 1240, langue)
    .replace('{count}', '1240')
    .replace('{playlists}', '3')
    .replace('{favorites}', '12')
    .replace('{queue}', '2');
}

/** Le message que la boîte de confirmation affiche, dans une langue. */
async function messageAffiche(langue: string): Promise<string> {
  const dict = dictionnaire(langue);
  const vus: string[] = [];
  await retirerUnDossier('/media/musique/Classique', {
    retirer: async () => ({ ...ANNONCE, music_dirs: ['/media/musique'] }),
    confirmer: async (m) => {
      vus.push(m);
      return false;
    },
    annoncer: () => {},
    tr: (k) => dict[k] ?? k,
    langue,
  });
  expect(vus).toHaveLength(1);
  return vus[0];
}

describe('#3345 : la confirmation de retrait dit tout AVANT de poser la question', () => {
  it('français : le texte affiché, mot pour mot, question en dernier', async () => {
    expect(await messageAffiche('fr')).toBe(
      'Le dossier a été retiré. 1240 pistes ne sont plus sous aucun dossier de musique, ' +
        'le scan ne les visitera plus. Si vous confirmez, ces pistes et les albums qui ' +
        'n’auraient plus aucune piste seront retirés de la bibliothèque Tune. ' +
        'Leur place dans les playlists (3), les favoris (12) et la file d’attente (2) disparaîtra aussi. ' +
        'Les fichiers sur le disque ne sont ni modifiés ni supprimés. ' +
        'Retirer ces 1240 pistes de la bibliothèque ?',
    );
  });

  for (const langue of ONZE_LANGUES) {
    it(`${langue} : ce qui s'est passé, ce qui partirait, les fichiers, puis la question`, async () => {
      const dict = dictionnaire(langue);
      const m = await messageAffiche(langue);

      const passe = remplir(dict['settings.orphanTracksRemoved'] ?? '∅ orphanTracksRemoved', langue);
      const partirait = remplir(dict['settings.orphanTracksWouldGo'] ?? '∅ orphanTracksWouldGo', langue);
      // rc14 (point 10) — l'impact est un cadre `{list}` et un morceau par
      // catégorie non nulle : les trois morceaux doivent y être, dans l'ordre.
      const impact = remplir(dict['settings.orphanTracksImpactPlaylists']);
      const favoris = remplir(dict['settings.orphanTracksImpactFavorites']);
      const file = remplir(dict['settings.orphanTracksImpactQueue']);
      // La liste peut ouvrir la phrase (hongrois) : elle prend alors la majuscule.
      const ou = (x: string) => m.toLowerCase().indexOf(x.toLowerCase());
      expect(ou(impact)).toBeGreaterThanOrEqual(0);
      expect(ou(impact)).toBeLessThan(ou(favoris));
      expect(ou(favoris)).toBeLessThan(ou(file));
      const fichiers = dict['settings.orphanTracksFilesSafe'];
      const question = remplir(dict['settings.orphanTracksAsk'], langue);

      // Le message commence par ce qui s'est passé et FINIT par la question.
      expect(m.startsWith(passe)).toBe(true);
      expect(m.endsWith(question)).toBe(true);
      // Une seule question, et c'est la dernière phrase.
      expect(m.indexOf(question)).toBe(m.length - question.length);
      // L'ordre : passé < ce qui partirait < impact < fichiers < question.
      const positions = [passe, partirait, impact, fichiers, question].map(ou);
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      // Les nombres sont dits, aucun marqueur ne survit.
      for (const n of ['1240', '3', '12', '2']) expect(m).toContain(n);
      expect(m).not.toMatch(/\{[a-z]+\}/);
      // La question ne précède plus rien : pas de « ? » avant la fin.
      expect(m.slice(0, m.length - question.length)).not.toMatch(/[?？;]\s/);
    });
  }
});
