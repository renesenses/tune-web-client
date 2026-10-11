// @vitest-environment jsdom
//
// tune-server-rust#6124 — demande de forum-hifi.fr (fil 41831, #792) : lire
// ORIGINALRELEASEDATE et VERSION, et « afficher la liste des tags réellement
// présents dans les fichiers, et pas seulement une liste standard ».
//
// 1. Les deux critères des règles intelligentes (« Année de sortie
//    originale », « Version »), aux deux niveaux, dans les onze langues.
// 2. Le tiroir des balises d'une piste montre la liste RÉELLE servie par
//    `GET /library/tracks/{id}/file-tags`, sous ses clés d'origine, et dit
//    quand le serveur l'a coupée ; il retombe sur `/all-tags` quand la route
//    manque (serveur antérieur).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import TrackTagsDrawer from '../../components/partages/TrackTagsDrawer.svelte';
import { CHAMPS, champsDe } from '../smartRegles';
import { GROUPES_CHAMPS_PISTE } from '../champsPiste';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let routeFileTags: 'liste' | 'absente' | 'sans-fichier' = 'liste';

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  routeFileTags = 'liste';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const rep = (corps: unknown, status = 200) =>
      new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
    if (/\/tracks\/7\/tenues$/.test(u)) return rep({ track_id: 7, fields: [] });
    if (/\/tracks\/7\/all-tags$/.test(u)) {
      return rep({
        track_id: 7,
        db_fields: { title: 'So What', original_date: '1959-08-17', version: 'Remaster 2009' },
        file_tags: { TrackTitle: ['So What (générique)'] },
        file_exists: true,
      });
    }
    if (/\/tracks\/7\/file-tags$/.test(u)) {
      if (routeFileTags === 'absente') return rep({ error: 'not found' }, 404);
      if (routeFileTags === 'sans-fichier') {
        return rep({ track_id: 7, available: false, reason: 'no_local_file', tags: [] });
      }
      return rep({
        track_id: 7,
        available: true,
        format: 'FLAC',
        truncated: true,
        tags: [
          { block: 'vorbis', key: 'TITLE', value: 'So What' },
          { block: 'vorbis', key: 'ORIGINALRELEASEDATE', value: '1959-08-17' },
          { block: 'vorbis', key: 'VERSION', value: 'Remaster 2009' },
          { block: 'vorbis', key: 'LYRICS', value: 'la la', truncated: true },
        ],
      });
    }
    return rep({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function ouvrir() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TrackTagsDrawer, { target: hote, props: { trackId: 7, onClose: () => {} } });
}

describe('#6124 — critères « Année de sortie originale » et « Version »', () => {
  it('existent aux deux niveaux, avec le bon type', () => {
    const annee = CHAMPS.find((c) => c.value === 'original_year');
    const version = CHAMPS.find((c) => c.value === 'version');
    expect(annee?.type).toBe('int');
    expect(version?.type).toBe('text');
    for (const niveau of ['collection', 'playlist'] as const) {
      const noms = champsDe(niveau).map((c) => c.value);
      expect(noms, niveau).toContain('original_year');
      expect(noms, niveau).toContain('version');
    }
  });

  it('les libellés existent dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of [
        'smartCollection.fieldOriginalYear',
        'smartCollection.fieldVersion',
        'trackTags.fileTagsTruncated',
        'trackTags.valueTruncated',
        'trackTags.fileUnreadable',
        'trackTags.noLocalFile',
      ]) {
        expect(d[cle], `${code} : ${cle}`).toBeTruthy();
      }
      expect(d['trackTags.fileTagsTruncated'], code).toContain('{count}');
    }
  });

  it('la date originale et la version ont leur place dans la fiche', () => {
    const champs = GROUPES_CHAMPS_PISTE.flatMap((g) => g.champs);
    expect(champs).toContain('original_date');
    expect(champs).toContain('version');
  });
});

describe('#6124 — le tiroir montre les balises réellement présentes', () => {
  it('liste les clés d’origine du fichier et dit la coupe', { timeout: 30_000 }, async () => {
    ouvrir();
    await attendre();
    const bloc = hote!.querySelector('[data-balises-fichier]');
    expect(bloc, 'la liste de /file-tags n’est pas affichée').not.toBeNull();
    const texte = bloc!.textContent ?? '';
    expect(texte).toContain('ORIGINALRELEASEDATE');
    expect(texte).toContain('1959-08-17');
    expect(texte).toContain('VERSION');
    expect(texte).toContain('Remaster 2009');
    expect(texte).toContain('FLAC');
    expect(texte).toContain(fr['trackTags.valueTruncated']);
    expect(texte).toContain(fr['trackTags.fileTagsTruncated'].replace('{count}', '4'));
    // La lecture générique n’est plus montrée quand la liste réelle est là.
    expect(hote!.textContent).not.toContain('So What (générique)');
  });

  it('une piste sans fichier local le dit', { timeout: 30_000 }, async () => {
    routeFileTags = 'sans-fichier';
    ouvrir();
    await attendre();
    const bloc = hote!.querySelector('[data-balises-fichier]');
    expect(bloc?.textContent).toContain(fr['trackTags.noLocalFile']);
  });

  it('un serveur sans la route retombe sur /all-tags', { timeout: 30_000 }, async () => {
    routeFileTags = 'absente';
    ouvrir();
    await attendre();
    expect(hote!.querySelector('[data-balises-fichier]')).toBeNull();
    expect(hote!.textContent).toContain('So What (générique)');
  });
});
