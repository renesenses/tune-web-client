/**
 * tune-server-rust#5530 — le marquage « généré par IA » de Qobuz.
 *
 * FabienM, fil forum 2053 : « Qobuz a introduit un tag pour identifier [les
 * contenus IA]. Il serait bien de le récupérer dans Tune pour marquer les
 * contenus IA et ajouter un critère dans les smart playlists (“pas d'IA”). »
 *
 * Le serveur rend `ai_generated` sur un album Qobuz (relevé sur `album/get`
 * le 05/10/2026 : `true` pour « Psychedelic Mongolian Trip Hop (…) AI Album »,
 * clé absente pour Kind of Blue) et sur un favori de service.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { estMarqueIa, marquageIaADemander } from '../contenuIa';
import {
  CHAMPS,
  champsSaisissables,
  operateursDe,
  regleComplete,
  sansValeur,
  typeDuChamp,
  valeurInitiale,
} from '../smartRegles';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ALBUM_IA = {
  source_id: 'tj9je5zd70wsc',
  title: 'Psychedelic Mongolian Trip Hop ("Painted Yurts, Painted Souls") AI Album',
  ai_generated: true,
};
const TEMOIN = { source_id: '5099749522428', title: 'Kind of Blue' };

describe('#5530 — lire le marquage', () => {
  it('seul `true` vaut marquage', () => {
    expect(estMarqueIa(ALBUM_IA)).toBe(true);
    expect(estMarqueIa(TEMOIN)).toBe(false);
    expect(estMarqueIa({ ai_generated: false })).toBe(false);
    expect(estMarqueIa({ ai_generated: 'true' })).toBe(false);
    expect(estMarqueIa(null)).toBe(false);
  });

  it('la fiche d’un album Qobuz sans marquage le demande au serveur, et seulement elle', () => {
    expect(marquageIaADemander('qobuz', TEMOIN)).toBe(true);
    expect(marquageIaADemander('Qobuz', TEMOIN)).toBe(true);
    expect(marquageIaADemander('qobuz', ALBUM_IA)).toBe(false);
    expect(marquageIaADemander('qobuz', { ai_generated: false })).toBe(false);
    expect(marquageIaADemander('tidal', TEMOIN)).toBe(false);
    expect(marquageIaADemander(null, TEMOIN)).toBe(false);
  });
});

describe('#5530 — le badge est rendu là où l’album se montre', () => {
  it('la fiche d’album affiche le badge depuis l’album complété', () => {
    const fiche = lire('../../components/v2/AlbumDetailV2.svelte');
    expect(fiche).toMatch(/\{#if estMarqueIa\(albumAffiche\)\}/);
    expect(fiche).toMatch(/marquageIaADemander\(svc, album\)/);
  });

  it('les vignettes de service (recherche, éditorial, favoris) affichent le badge', () => {
    const ecran = lire('../../components/v2/StreamingV2.svelte');
    expect(ecran).toMatch(/\{#if estMarqueIa\(p\)\}/);
    // Et le favori emporte le marquage.
    expect(ecran).toMatch(/aiGenerated: typeof p\?\.ai_generated === 'boolean'/);
  });

  it('le favori envoie `ai_generated` quand il est connu', () => {
    const favoris = lire('../streamingFavorites.ts');
    expect(favoris).toMatch(/ai_generated: ref\.aiGenerated/);
  });
});

describe('#5530 — la règle « Généré par IA »', () => {
  it('existe aux deux niveaux, saisissable, sans valeur, « non » d’abord', () => {
    expect(CHAMPS.some((c) => c.value === 'ai_generated' && c.type === 'marquage')).toBe(true);
    for (const n of ['collection', 'playlist'] as const) {
      expect(champsSaisissables(n).some((c) => c.value === 'ai_generated'), n).toBe(true);
      expect(typeDuChamp('ai_generated', n)).toBe('marquage');
      expect(operateursDe('ai_generated', n).map((o) => o.value)).toEqual(['is_false', 'is_true']);
    }
    expect(sansValeur('is_false')).toBe(true);
    expect(sansValeur('is_true')).toBe(true);
    expect(valeurInitiale('is_false', 'marquage')).toBeNull();
    // « Exclure le contenu généré par IA » est une règle complète telle quelle.
    expect(regleComplete({ field: 'ai_generated', op: 'is_false', value: null })).toBe(true);
  });
});

type Dict = Record<string, string | undefined>;
const LANGUES: Array<[string, Dict]> = [
  ['fr', fr as Dict], ['en', en as Dict], ['de', de as Dict], ['es', es as Dict],
  ['it', it_ as Dict], ['ja', ja as Dict], ['ko', ko as Dict], ['ro', ro as Dict],
  ['sv', sv as Dict], ['zh', zh as Dict], ['hu', hu as Dict],
];
const CLES = [
  'smartCollection.fieldAiGenerated',
  'smartCollection.opYes',
  'smartCollection.opNo',
  'v2.str.aiGenerated',
  'v2.str.aiGeneratedTip',
];

describe('#5530 — libellés dans les ONZE langues', () => {
  it.each(LANGUES)('%s', (_l, d) => {
    for (const k of CLES) {
      expect(typeof d[k] === 'string' && d[k]!.trim().length > 0, k).toBe(true);
    }
  });
});
