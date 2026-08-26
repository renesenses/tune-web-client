/**
 * Provenance des paroles — renesenses/tune-server-rust#2432.
 *
 * Le serveur nomme la source dans CHAQUE réponse. Contrat de
 * `tune-server/src/routes/library/tracks.rs`, marqué « the web client is built
 * against this — do not change » :
 *
 *     {"synced": bool, "source": "lrc"|"tag"|"lrclib", "lines": [...]}
 *
 * `GET /lyrics/by-meta` (radios, streaming) sert le même champ, par
 * `synced_lines_response(source, …)` / `plain_lines_response(source, …)`.
 *
 * `lib/lyrics.ts` conservait déjà `source` à la normalisation — et aucun des
 * trois appelants ne le lisait, aucun composant ne le recevait. Résultat :
 * `lrclib` est un appel réseau sortant vers un tiers (titre + artiste de ce
 * qu'on écoute partent chez lrclib.net), et rien à l'écran ne le disait. Jean
 * Valjean a dû poser la question sur le forum, fil 1555, le 26/08/2026 :
 * « des paroles que je n'ai ni dans le fichier de musique, ni en fichier lrc ou
 * txt s'affichent. […] Tune va les chercher sur un site ? »
 *
 * Les trois cas sont nommés, pas seulement le cas réseau : sans cela personne —
 * testeur compris — ne peut vérifier de quelle source vient le texte affiché,
 * et c'est précisément ce qui rendait son protocole invérifiable.
 *
 * Les tests de normalisation sont behavioraux ; ceux qui portent sur le
 * balisage lisent la source, comme `npEqButton.test.ts` (même écran, même
 * raison : ce qui compte est la structure du modèle, pas une chaîne).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lyricsSourceKind, normalizeLyricsResponse } from '../lyrics';

const lire = (chemin: string) => readFileSync(resolve(process.cwd(), chemin), 'utf-8');

const NOW_PLAYING = lire('src/components/NowPlaying.svelte');
const PANNEAU = lire('src/components/NowPlayingLyrics.svelte');
const GRAND_ECRAN = lire('src/components/TvView.svelte');

describe('lyricsSourceKind', () => {
  it('reconnaît les trois valeurs du contrat serveur', () => {
    expect(lyricsSourceKind('lrc')).toBe('lrc');
    expect(lyricsSourceKind('tag')).toBe('tag');
    expect(lyricsSourceKind('lrclib')).toBe('lrclib');
  });

  it('tolère la casse et les espaces (le champ traverse deux sérialisations)', () => {
    expect(lyricsSourceKind(' LRCLIB ')).toBe('lrclib');
    expect(lyricsSourceKind('Tag')).toBe('tag');
  });

  it('ne nomme rien qu’elle ne connaisse pas — mieux vaut se taire qu’inventer', () => {
    expect(lyricsSourceKind(null)).toBeNull();
    expect(lyricsSourceKind(undefined)).toBeNull();
    expect(lyricsSourceKind('')).toBeNull();
    expect(lyricsSourceKind('musixmatch')).toBeNull();
  });

  /** La source doit survivre à la normalisation : c'est là qu'elle entre. */
  it('lit la source telle que la normalisation la rend, dans les deux formes de réponse', () => {
    const nouvelle = normalizeLyricsResponse({
      synced: true,
      source: 'lrclib',
      lines: [{ t_ms: 0, text: 'une ligne' }],
    });
    expect(lyricsSourceKind(nouvelle?.source)).toBe('lrclib');

    const historique = normalizeLyricsResponse({ lyrics: 'une ligne', source: 'tag' });
    expect(lyricsSourceKind(historique?.source)).toBe('tag');
  });
});

describe('l’écran « En écoute » ne jette plus la source', () => {
  it('le panneau la reçoit en propriété', () => {
    // Jusqu'à la déstructuration : `}` seul ne borne pas l'interface, il tombe
    // dans le type inline de `syncedLines`.
    const debut = PANNEAU.indexOf('interface Props');
    expect(debut, 'interface Props introuvable').toBeGreaterThan(-1);
    const props = PANNEAU.slice(debut, PANNEAU.indexOf('let {', debut));
    expect(props).toMatch(/^\s*source\s*:/m);
  });

  it('le panneau nomme les trois cas, LRCLIB compris — c’est la sortie réseau invisible', () => {
    for (const cle of ['lyrics.source.lrc', 'lyrics.source.tag', 'lyrics.source.lrclib']) {
      expect(PANNEAU, `clé manquante : ${cle}`).toContain(`$t('${cle}')`);
    }
  });

  it('les deux chargements retiennent la source', () => {
    for (const fn of ['async function loadNpLyrics', 'async function loadMetaLyrics']) {
      const debut = NOW_PLAYING.indexOf(fn);
      expect(debut, `${fn} est introuvable`).toBeGreaterThan(-1);
      const corps = NOW_PLAYING.slice(debut, NOW_PLAYING.indexOf('\n  }', debut));
      expect(corps, `${fn} jette encore la source`).toMatch(/npLyricsSource\s*=/);
    }
  });

  it('transmet la source au panneau', () => {
    const debut = NOW_PLAYING.indexOf('<NowPlayingLyrics');
    expect(debut, '<NowPlayingLyrics est introuvable').toBeGreaterThan(-1);
    expect(NOW_PLAYING.slice(debut, NOW_PLAYING.indexOf('/>', debut))).toContain('npLyricsSource');
  });

  /**
   * La source décrit les paroles affichées : elle doit disparaître avec elles.
   * Sinon le cadre annonce « Source : fichier .lrc » sur un texte qui vient
   * d'ailleurs — un mensonge est pire que le silence d'avant.
   */
  it('oublie la source partout où elle oublie les paroles', () => {
    const oublis = [...NOW_PLAYING.matchAll(/npLyrics = null;/g)];
    expect(oublis.length, 'aucune remise à zéro des paroles trouvée').toBeGreaterThan(0);
    for (const m of oublis) {
      const ligne = NOW_PLAYING.slice(m.index!, NOW_PLAYING.indexOf('\n', m.index!));
      expect(ligne, 'les paroles sont vidées mais la source reste').toContain(
        'npLyricsSource = null',
      );
    }
  });
});

describe('le mode Grand écran ne la jette plus non plus', () => {
  /** Il tient la réponse entière (`LyricsData`) : il n'a aucune excuse. */
  it('nomme la source', () => {
    expect(GRAND_ECRAN).toContain('lyricsSourceKind');
    for (const cle of ['lyrics.source.lrc', 'lyrics.source.tag', 'lyrics.source.lrclib']) {
      expect(GRAND_ECRAN, `clé manquante : ${cle}`).toContain(`$t('${cle}')`);
    }
  });
});

describe('les onze langues nomment la provenance', () => {
  /**
   * Une clé absente de fr.ts n'a AUCUN repli : elle s'affiche telle quelle.
   * `scripts/check-i18n.mjs` garde la parité globale ; ce test-ci nomme les
   * trois clés, pour que leur perte se lise ici et pas dans un décompte.
   */
  const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];

  it('les trois clés existent dans les onze fichiers', () => {
    for (const langue of LANGUES) {
      const src = lire(`src/lib/locales/${langue}.ts`);
      for (const cle of ['lyrics.source.lrc', 'lyrics.source.tag', 'lyrics.source.lrclib']) {
        expect(src, `${langue}.ts : ${cle} manquante`).toMatch(
          new RegExp(`['"]${cle.replace('.', '\\.')}['"]\\s*:`),
        );
      }
    }
  });
});
