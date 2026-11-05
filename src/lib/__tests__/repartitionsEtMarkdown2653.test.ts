// web#2653 — les répartitions de `/library/stats` et le rendu Markdown
// assaini des notes personnelles (serveur : tune-server-rust#7849).
import { describe, expect, it } from 'vitest';

import {
  filtreDe, libelleFrequence, lignesRepartition, lireRepartitions,
  type Traducteur,
} from '../repartitionsBibliotheque';
import { adresseHttps, rendreMarkdownSur } from '../markdownSur';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const espaces = (s: string) => s.replace(/[\s  ]+/g, ' ');

const TR: Traducteur = {
  inconnu: 'Inconnu',
  decennie: 'Années {decade}',
  role: (r) => ({ composer: 'Compositeur' } as Record<string, string>)[r] ?? r,
};

/** La forme exacte de la PR serveur tune-server-rust#7874. */
const STATS = {
  tracks: 10, albums: 3, artists: 2,
  distributions: {
    by_codec: [{ value: null, tracks: 1 }, { value: 'flac', tracks: 6 }, { value: 'mp3', tracks: 3 }],
    by_sample_rate: [{ value: 44100, tracks: 5 }, { value: 96000, tracks: 3 }, { value: 2822400, tracks: 1 }, { value: null, tracks: 1 }],
    by_decade: [{ value: 1970, tracks: 2 }, { value: 1990, tracks: 7 }, { value: null, tracks: 1 }],
    by_credit_role: [{ value: 'composer', tracks: 8, people: 3 }, { value: 'producer', tracks: 2, people: 1 }],
  },
};

describe('#2653 — lecture des répartitions', () => {
  it('lit les quatre répartitions, inconnu (value null) toujours en dernier', () => {
    const r = lireRepartitions(STATS)!;
    expect(r).not.toBeNull();
    expect(r.by_codec.map((e) => e.value)).toEqual(['flac', 'mp3', null]);
    expect(r.by_sample_rate.at(-1)!.value).toBeNull();
    expect(r.by_decade.map((e) => e.value)).toEqual([1970, 1990, null]);
    expect(r.by_credit_role[0]).toEqual({ value: 'composer', tracks: 8, people: 3 });
  });

  it('repli : clé absente (serveur ancien), null (lecture échouée) ou forme inattendue', () => {
    expect(lireRepartitions({ tracks: 1, albums: 1, artists: 1 })).toBeNull();
    expect(lireRepartitions({ tracks: 1, distributions: null })).toBeNull();
    expect(lireRepartitions({ tracks: 1, distributions: [] })).toBeNull();
    expect(lireRepartitions(null)).toBeNull();
    // Une répartition manquante ou mal formée devient une liste vide, sans planter.
    const r = lireRepartitions({ distributions: { by_codec: 'x', by_decade: [null, { value: 2000 }] } })!;
    expect(r.by_codec).toEqual([]);
    expect(r.by_sample_rate).toEqual([]);
    expect(r.by_decade).toEqual([{ value: 2000, tracks: 0 }]);
  });

  it('valeurs exactes et pourcentages sur le total de la répartition', () => {
    const r = lireRepartitions(STATS)!;
    const ls = lignesRepartition('by_codec', r.by_codec, 'fr', TR);
    expect(ls.map((l) => l.label)).toEqual(['FLAC', 'MP3', 'Inconnu']);
    expect(ls.map((l) => l.tracks)).toEqual([6, 3, 1]);
    expect(ls.map((l) => l.pourcentage)).toEqual([60, 30, 10]);
    expect(espaces(ls[0].pourcentageTexte)).toBe('60 %');
    expect(ls[2].inconnu).toBe(true);
    expect(lignesRepartition('by_codec', r.by_codec, 'en', TR)[0].pourcentageTexte).toBe('60%');
  });

  it('fréquences en kHz, à la langue de l’écran, DSD nommé', () => {
    expect(libelleFrequence(44100, 'fr')).toBe('44,1 kHz');
    expect(libelleFrequence(44100, 'en')).toBe('44.1 kHz');
    expect(libelleFrequence(96000, 'fr')).toBe('96 kHz');
    expect(espaces(libelleFrequence(2822400, 'fr'))).toBe('DSD64 · 2 822,4 kHz');
  });

  it('décennies selon le gabarit traduit, rôles avec pistes ET personnes', () => {
    const r = lireRepartitions(STATS)!;
    expect(lignesRepartition('by_decade', r.by_decade, 'fr', TR).map((l) => l.label))
      .toEqual(['Années 1970', 'Années 1990', 'Inconnu']);
    const roles = lignesRepartition('by_credit_role', r.by_credit_role, 'fr', TR);
    expect(roles[0]).toMatchObject({ label: 'Compositeur', tracks: 8, people: 3, peopleTexte: '3' });
    expect(roles[1].label).toBe('producer');
  });

  it('filtres : format et fréquence ouvrent la Bibliothèque, ni la décennie, ni le rôle, ni l’inconnu', () => {
    expect(filtreDe('by_codec', 'flac')).toEqual({ format: 'FLAC' });
    expect(filtreDe('by_sample_rate', 96000)).toEqual({ frequence: 96000 });
    expect(filtreDe('by_codec', null)).toBeNull();
    expect(filtreDe('by_sample_rate', null)).toBeNull();
    expect(filtreDe('by_decade', 1990)).toBeNull();
    expect(filtreDe('by_credit_role', 'composer')).toBeNull();
  });

  it('les libellés existent dans les quinze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      expect(d['statsBibliotheque.decennie'], code).toContain('{decade}');
      expect(d['statsBibliotheque.pistes'], code).toContain('{n}');
      expect(d['statsBibliotheque.personnes'], code).toContain('{n}');
      for (const k of ['{tracks}', '{albums}', '{artists}']) expect(d['statsBibliotheque.totaux'], code).toContain(k);
      for (const k of ['titre', 'indisponible', 'inconnu', 'codecs', 'frequences', 'decennies', 'roles']) {
        expect(d[`statsBibliotheque.${k}`], `${code} ${k}`).toBeTruthy();
      }
      for (const k of ['titre', 'indisponible', 'rechercher', 'type.artist', 'type.album', 'type.track']) {
        expect(d[`mesNotes.${k}`], `${code} ${k}`).toBeTruthy();
      }
    }
  });
});

describe('#2653 — Markdown assaini', () => {
  it('rend le Markdown courant', () => {
    const h = rendreMarkdownSur('**Pressage japonais**, *piano* en retrait\n\n- un\n- deux');
    expect(h).toContain('<strong>Pressage japonais</strong>');
    expect(h).toContain('<em>piano</em>');
    expect(h).toContain('<li>deux</li>');
  });

  it('<script> : affiché en texte, jamais une balise', () => {
    const h = rendreMarkdownSur('avant\n\n<script>alert(1)</script>\n\naprès');
    expect(h).not.toMatch(/<script/i);
    expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('onerror : une image HTML brute reste du texte, sans attribut actif', () => {
    const h = rendreMarkdownSur('a <img src=x onerror=alert(1)> b');
    expect(h).not.toMatch(/<img/i);
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // Pas de balise ouverte qui porterait l'attribut.
    expect(h).not.toMatch(/<[a-z][^>]*onerror/i);
  });

  it('javascript:, data:, http: : le libellé seul, aucun lien', () => {
    for (const md of ['[clic](javascript:alert(1))', '[clic](JaVaScRiPt:alert(1))', '[clic](  javascript:alert(1))',
      '[clic](data:text/html,<script>alert(1)</script>)', '[clic](http://exemple.fr)', '[clic](vbscript:x)',
      '<a href="javascript:alert(1)">clic</a>']) {
      const h = rendreMarkdownSur(md);
      expect(h, md).not.toMatch(/<a\s/i);
      // Aucune balise réelle qui porterait une adresse (le HTML brut reste échappé).
      expect(h, md).not.toMatch(/<[^>]*href=/i);
      expect(h, md).toContain('clic');
    }
  });

  it('https : un vrai lien, nouvel onglet, sans transmettre l’origine', () => {
    const h = rendreMarkdownSur('[Discogs](https://www.discogs.com/fr/release/1 "Fiche")');
    expect(h).toContain('<a href="https://www.discogs.com/fr/release/1" title="Fiche" target="_blank" rel="noopener noreferrer nofollow">Discogs</a>');
    // Un guillemet dans le titre ne sort pas de l'attribut.
    expect(rendreMarkdownSur('[a](https://x.fr "t\\" onmouseover=1")')).not.toMatch(/" onmouseover/);
  });

  it('les images ne sont jamais chargées : un lien https, sinon le texte alternatif', () => {
    expect(rendreMarkdownSur('![pochette](https://img.exemple/p.jpg)')).not.toMatch(/<img/i);
    expect(rendreMarkdownSur('![pochette](https://img.exemple/p.jpg)')).toContain('href="https://img.exemple/p.jpg"');
    expect(rendreMarkdownSur('![pochette](javascript:alert(1))')).not.toMatch(/<[^>]*href=/i);
  });

  it('adresseHttps : seules les adresses https absolues passent', () => {
    expect(adresseHttps('https://a.fr/x')).toBe('https://a.fr/x');
    expect(adresseHttps('http://a.fr')).toBeNull();
    expect(adresseHttps('/relatif')).toBeNull();
    expect(adresseHttps('javascript:alert(1)')).toBeNull();
    expect(adresseHttps('')).toBeNull();
  });
});
