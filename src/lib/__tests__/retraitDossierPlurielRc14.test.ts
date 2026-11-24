// Recette rc14 du 24/11, point 10 (Didier, relecture) — le message de
// retrait d'un dossier disait « 1 pistes », et annonçait « file d'attente
// (0) » quand rien n'y était.
//
//  1. chaque phrase qui porte un nombre de pistes a ses formes plurielles
//     (ICU, règles CLDR de la langue : 1 / 2-4 / 5+ en polonais, russe,
//     ukrainien ; 1 / 2-19 / 20+ « de » en roumain) ;
//  2. la phrase d'impact ne cite que les catégories non nulles.
import { describe, expect, it } from 'vitest';
import { retirerUnDossier } from '../ajoutDossier';
import { questionDePurge, verdictDePurge, verdictDeRefus, type RetraitDossier } from '../purgeOrphelines';
import { categoriesExigees, blocsPluriels } from '../pluriel';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const CLES_COMPTEES = [
  'settings.orphanTracksRemoved',
  'settings.orphanTracksAsk',
  'settings.orphanTracksPurged',
  'settings.orphanTracksRefused',
  'settings.orphanTracksKept',
];

function annonce(n: number, impact: RetraitDossier['impact']): RetraitDossier {
  return { dirs: ['/m'], orphan_tracks: n, confirm_purge_required: n, impact };
}

async function question(langue: string, rep: RetraitDossier): Promise<string> {
  const dict = dictionnaire(langue);
  let vu = '';
  await retirerUnDossier('/m/Classique', {
    retirer: async () => ({ ...rep, music_dirs: ['/m'] }),
    confirmer: async (m) => { vu = m; return false; },
    annoncer: () => {},
    tr: (k) => dict[k] ?? k,
    langue,
  });
  return vu;
}

describe('rc14 point 10 — pluriel des pistes', () => {
  it('🔴 français, une piste : « 1 piste », jamais « 1 pistes »', async () => {
    const m = await question('fr', annonce(1, { tracks: 1, playlists: 0, favorites: 0, queue_entries: 0 }));
    expect(m).toContain('1 piste n’est plus');
    expect(m).not.toMatch(/\b1 pistes\b/);
    expect(m).toContain('Retirer cette piste de la bibliothèque ?');
  });

  it('🔴 anglais, une piste : « 1 track », jamais « 1 tracks »', async () => {
    const m = await question('en', annonce(1, {}));
    expect(m).toContain('1 track is');
    expect(m).not.toMatch(/\b1 tracks\b/);
  });

  it('🔴 polonais, russe, ukrainien : trois formes (1, 3, 5)', () => {
    const tr = (l: string) => (k: string) => dictionnaire(l)[k] ?? k;
    const purge = (l: string, n: number) => verdictDePurge({ purged: n }, tr(l), l).message;
    expect(purge('pl', 1)).toContain('1 utwór');
    expect(purge('pl', 3)).toContain('3 utwory');
    expect(purge('pl', 5)).toContain('5 utworów');
    expect(purge('ru', 1)).toContain('1 трек');
    expect(purge('ru', 3)).toContain('3 трека');
    expect(purge('ru', 5)).toContain('5 треков');
    expect(purge('uk', 1)).toContain('1 трек');
    expect(purge('uk', 3)).toContain('3 треки');
    expect(purge('uk', 5)).toContain('5 треків');
    expect(purge('ro', 1)).toContain('1 piesă');
    expect(purge('ro', 25)).toContain('25 de piese');
  });

  it('les cinq clés comptées portent, dans les vingt langues, toutes les formes que la langue exige', () => {
    for (const l of ONZE_LANGUES) {
      for (const cle of CLES_COMPTEES) {
        const s = dictionnaire(l)[cle];
        const blocs = blocsPluriels(s);
        expect(blocs.length, `${l} ${cle}`).toBe(1);
        for (const c of categoriesExigees(l)) expect(blocs[0].formes.has(c), `${l} ${cle} ${c}`).toBe(true);
      }
    }
  });

  it('aucune phrase de la purge ne garde de marqueur, de 0 à 25, dans les vingt langues', () => {
    for (const l of ONZE_LANGUES) {
      const tr = (k: string) => dictionnaire(l)[k] ?? k;
      for (let n = 1; n <= 25; n++) {
        const rep = annonce(n, { playlists: 2, favorites: 1, queue_entries: 3 });
        for (const s of [
          questionDePurge(rep, tr, l),
          verdictDePurge({ purged: n }, tr, l).message,
          verdictDePurge({ purge_refused: true, orphan_tracks: n }, tr, l).message,
          verdictDeRefus(rep, tr, l).message,
        ]) {
          expect(s, `${l} ${n}`).not.toMatch(/\{|\}/);
        }
      }
    }
  });
});

describe('rc14 point 10 — impact : seulement les catégories non nulles', () => {
  it('🔴 file d’attente vide : elle n’est pas citée', async () => {
    const m = await question('fr', annonce(5, { playlists: 2, favorites: 3, queue_entries: 0 }));
    expect(m).toContain('Leur place dans les playlists (2) et les favoris (3) disparaîtra aussi.');
    expect(m).not.toContain('(0)');
    expect(m).not.toContain('file d’attente');
  });

  it('🔴 une seule catégorie : elle seule', async () => {
    const m = await question('fr', annonce(5, { playlists: 0, favorites: 0, queue_entries: 4 }));
    expect(m).toContain('Leur place dans la file d’attente (4) disparaîtra aussi.');
    expect(m).not.toContain('playlists');
  });

  it('les trois : la phrase complète, comme avant', async () => {
    const m = await question('fr', annonce(5, { playlists: 3, favorites: 12, queue_entries: 2 }));
    expect(m).toContain('Leur place dans les playlists (3), les favoris (12) et la file d’attente (2) disparaîtra aussi.');
  });

  it('aucune : pas de phrase d’impact', async () => {
    const m = await question('fr', annonce(5, { playlists: 0, favorites: 0, queue_entries: 0 }));
    expect(m).not.toContain('Leur place');
  });

  it('vingt langues : jamais « (0) », toujours les nombres non nuls', async () => {
    for (const l of ONZE_LANGUES) {
      const m = await question(l, annonce(7, { playlists: 4, favorites: 0, queue_entries: 9 }));
      expect(m, l).not.toContain('(0)');
      expect(m, l).not.toContain('（0）');
      expect(m, l).toMatch(/4/);
      expect(m, l).toMatch(/9/);
      expect(m, l).not.toMatch(/\{|\}/);
    }
  });
});
