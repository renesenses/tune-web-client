/**
 * #1155 — « les libellés du Tableau de bord ne disent pas ce qu'ils comptent »
 * (Didier, fil 1566, 26/08/2026, deux grosses semaines d'usage).
 *
 * Ce que le serveur compte réellement, lu dans `tune-core/src/dashboard.rs` :
 *
 * ```sql
 * -- totaux
 * COUNT(*) AS total_plays, COUNT(DISTINCT track_id) AS unique_tracks
 * -- top_albums
 * SELECT ph.album_title, COUNT(*) AS play_count … GROUP BY ph.album_title
 * ```
 *
 * 🔴 `top_albums.play_count` compte les lignes de `playback_history`, c'est-à-
 * dire les PISTES lues de cet album — pas les écoutes de l'album. Un album de
 * seize titres écouté une fois en entier vaut 16. C'est exactement ce que
 * Didier ne comprenait pas : « pour Monk Movements je ne pense pas avoir
 * écouté cet album 16 fois ! ». Le chiffre était juste ; il n'était pas nommé.
 *
 * Et `top_tracks.play_count` est bien un COMPTE, pas une durée — son autre
 * hypothèse (« cet indicateur ne mesurerait-il pas la durée totale ») est
 * fausse, et l'écran le dit désormais.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const vue = readFileSync('src/components/DashboardView.svelte', 'utf8');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu'];
const locale = (l: string) => readFileSync(`src/lib/locales/${l}.ts`, 'utf8');

describe('#1155 — chaque chiffre dit ce qu\'il compte', () => {
  it('les quatre totaux portent une légende', () => {
    for (const k of ['dashboard.hint.plays', 'dashboard.hint.listeningTime',
                     'dashboard.hint.uniqueTracks', 'dashboard.hint.uniqueArtists']) {
      expect(vue, k).toContain(k);
    }
  });

  it('les trois classements aussi', () => {
    for (const k of ['dashboard.hint.topArtists', 'dashboard.hint.topAlbums',
                     'dashboard.hint.topTracks']) {
      expect(vue, k).toContain(k);
    }
  });

  it('🔴 la légende des albums dit que le compte porte sur les PISTES', () => {
    // C'est le cœur de sa remarque : le chiffre était juste, il n'était pas
    // nommé. En français, le mot « pistes » doit y être.
    const fr = locale('fr');
    const ligne = fr.split('\n').find((l) => l.includes('dashboard.hint.topAlbums')) ?? '';
    expect(ligne.toLowerCase()).toContain('pistes');
    expect(ligne).toContain('16');
  });

  it('🔴 la légende des pistes écarte l\'hypothèse de la durée', () => {
    const fr = locale('fr');
    const ligne = fr.split('\n').find((l) => l.includes('dashboard.hint.topTracks')) ?? '';
    expect(ligne.toLowerCase()).toContain('durée');
  });

  it('la légende est VISIBLE, pas seulement une infobulle', () => {
    // « Est-il possible d'indiquer SUR CET ÉCRAN la signification des
    // chiffres » — donc un élément rendu, pas un `title=`.
    expect(vue).toContain('<div class="total-hint">');
    expect(vue).toContain('<div class="axis-hint">');
  });
});

describe('#1155 — la tendance a une échelle, et parle français', () => {
  it('l\'échelle est écrite', () => {
    expect(vue).toContain('dashboard.trend.axis');
  });

  it('🔴 aucune infobulle ne reste en anglais codé en dur', () => {
    // Cette garde en a trouvé DEUX de plus que le fil n'en nommait : la carte
    // « semaine × heure » et la frise horaire écrivaient elles aussi
    // « … plays » sur un écran français.
    // 🔴 Bornée aux INFOBULLES : `class="slot-plays"` est un nom de classe,
    // pas de l'anglais à l'écran. Une garde sur `plays"` seul rougissait
    // dessus — verte pour la mauvaise raison si on l'avait relâchée.
    expect(vue).not.toMatch(/title="[^"]*\bplays"/);
    for (const k of ['dashboard.trend.tip', 'dashboard.slot.tip', 'dashboard.hour.tip']) {
      expect(vue, k).toContain(k);
    }
    expect(vue).toContain(".replace('{day}', d.day)");
  });
});

describe('#1155 — plus un mot d\'anglais sur un écran français', () => {
  it('« Streak » passe par une clé', () => {
    expect(vue).not.toContain('<h3>Streak</h3>');
    expect(vue).toContain('dashboard.section.streak');
    for (const l of LANGUES) expect(locale(l), l).toContain('dashboard.section.streak');
  });

  it('🔴 « skippées » disparaît du français', () => {
    const fr = locale('fr');
    for (const cle of ['dashboard.section.completion', 'dashboard.completion.skipped']) {
      const ligne = fr.split('\n').find((l) => l.includes(cle)) ?? '';
      // 🔴 On lit la VALEUR, pas la ligne : la CLÉ elle-même contient
      // « skipped », et une garde posée sur la ligne entière serait rouge à
      // jamais — ou verte pour la mauvaise raison si on l'inversait.
      const valeur = ligne.slice(ligne.indexOf(':') + 1);
      expect(valeur, cle).not.toMatch(/skipp/i);
      expect(valeur.toLowerCase(), cle).toContain('interrompu');
    }
  });
});

describe('#1155 — la colonne de droite ne danse plus', () => {
  it('🔴 la place du cœur est RÉSERVÉE', () => {
    // « Le texte à droite des pistes locales n'est pas ajusté à droite comme
    // les pistes en streaming. » Ce n'est pas le texte qui bouge : une piste
    // de service porte un `HeartButton`, une piste locale sans `track_id` n'en
    // porte aucun, et la colonne se décale d'autant.
    const i = vue.indexOf('.track-heart {');
    expect(i).toBeGreaterThan(0);
    const bloc = vue.slice(i, vue.indexOf('}', i));
    expect(bloc).toContain('flex: 0 0 18px');
  });
});

describe('#1155 — les dix clés dans les ONZE langues', () => {
  const CLES = ['dashboard.hint.plays', 'dashboard.hint.listeningTime',
    'dashboard.hint.uniqueTracks', 'dashboard.hint.uniqueArtists',
    'dashboard.hint.topArtists', 'dashboard.hint.topAlbums', 'dashboard.hint.topTracks',
    'dashboard.trend.axis', 'dashboard.trend.tip', 'dashboard.section.streak'];
  for (const l of LANGUES) {
    it(l, () => {
      const src = locale(l);
      for (const c of CLES) expect(src, `${l} / ${c}`).toContain(c);
      // Le gabarit de l'infobulle porte ses deux emplacements.
      const tip = src.split('\n').find((x) => x.includes('dashboard.trend.tip')) ?? '';
      expect(tip).toContain('{day}');
      expect(tip).toContain('{plays}');
    });
  }
});
