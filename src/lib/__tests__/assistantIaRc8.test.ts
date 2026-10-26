/**
 * Assistant IA — usages de la rc8 (tune-server-rust, décisions du 23/10/2026 ;
 * #6839 pour les collections).
 *
 * Ce que l'écran doit tenir, sans serveur :
 *  - le résumé IA ne part dans le signalement forum QUE si la case est cochée ;
 *  - l'écart d'albums (« +12 / −3 ») se calcule avant d'appliquer ;
 *  - les sources sous licence sont citées sous les notes ;
 *  - chaque clé nouvelle existe dans les douze langues ;
 *  - les branchements : fiche album, Support, éditeur et écran Collections.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
const notifier = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() };
vi.mock('../stores/notifications', () => ({ notifications: notifier }));

const rc8 = await import('../assistantIaRc8');
const api = await import('../api');

const source = (chemin: string) =>
  readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

function repondre(status: number, corps: unknown) {
  const texte = JSON.stringify(corps);
  return vi.fn().mockResolvedValue({
    ok: status < 400, status, headers: new Headers(),
    text: async () => texte, json: async () => corps,
  });
}

describe('signalement forum et résumé IA', () => {
  it("n'envoie le résumé que si la case est cochée", async () => {
    const f = repondre(200, { url: 'https://x', images: 0 });
    vi.stubGlobal('fetch', f);
    await api.submitBugReport('Ma zone ne joue pas', [], { texte: 'Zone <zone-1> masquée', joindre: false });
    let corps = JSON.parse(f.mock.calls[0][1].body);
    expect(corps.resume_ia, 'case décochée : le résumé IA est parti').toBeUndefined();
    expect(corps.joindre_resume_ia).toBeUndefined();

    await api.submitBugReport('Ma zone ne joue pas', [], { texte: 'Zone <zone-1> masquée', joindre: true });
    corps = JSON.parse(f.mock.calls[1][1].body);
    expect(corps).toMatchObject({ resume_ia: 'Zone <zone-1> masquée', joindre_resume_ia: true });

    await api.submitBugReport('x');
    corps = JSON.parse(f.mock.calls[2][1].body);
    expect(corps).toEqual({ description: 'x' });
  });
});

describe('collections', () => {
  it("calcule l'écart d'albums avant d'appliquer", () => {
    expect(rc8.ecartAlbums([1, 2, 3, 4], [3, 4, 5])).toEqual({ gagnes: [5], perdus: [1, 2] });
  });
});

describe('notes et réglages', () => {
  it('cite les seules sources sous licence réellement utilisées', () => {
    const n = {
      notes: { paragraphes: [{ texte: 'x', sources: ['bio:artiste'] }], oeuvre: null, versions_presentes: [], ecartes: [] },
      attributions: [
        { bloc: 'bio:artiste', attribution: { source: 'wikipedia', url: null, licence: 'CC BY-SA 4.0' } },
        { bloc: 'bio:album', attribution: { source: 'wikipedia', url: null, licence: 'CC BY-SA 4.0' } },
      ],
    } as any;
    expect(rc8.attributionsACiter(n)).toEqual(['wikipedia — CC BY-SA 4.0']);
    expect(rc8.attributionsACiter(null)).toEqual([]);
  });

  it('lit la transcription des réglages, absente d\'un serveur ancien', () => {
    expect(rc8.transcriptionDesReglages({})).toBeNull();
    expect(rc8.transcriptionDesReglages({ transcription: { modele: 'whisper-1', source: 'coffre' } })?.source).toBe('coffre');
  });
});

describe('i18n et branchements', () => {
  const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ko', 'ja', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl'];
  const composants = [
    '../../components/v2/NotesPochetteIaV2.svelte',
    '../../components/v2/DiagnosticIaV2.svelte',
    '../../components/v2/CollectionIaV2.svelte',
    '../../components/v2/PropositionsCollectionsIaV2.svelte',
    '../../components/v2/PourquoiAlbumIaV2.svelte',
    '../../components/v2/CollectionsV2.svelte',
    '../../components/v2/AssistantIaReglagesV2.svelte',
    '../../components/v2/SupportV2.svelte',
  ];
  const cles = new Set<string>();
  for (const c of composants) {
    for (const m of source(c).matchAll(/\$t\('(assistantIa\.(?:notes|preview|secondOpinion|transcription|diag|coll)[A-Za-z0-9_.]*)'/g)) cles.add(m[1]);
  }
  for (const n of ['faible', 'moyenne', 'elevee']) cles.add(`assistantIa.diag.conf.${n}`);
  for (const s of ['coffre', 'cle_principale', 'environnement']) cles.add(`assistantIa.transcription.source.${s}`);

  it('trouve les clés des nouveaux écrans', () => {
    expect(cles.size).toBeGreaterThan(40);
  });

  for (const L of LANGUES) {
    it(`chaque clé existe en ${L}`, () => {
      const texte = source(`../locales/${L}.ts`);
      const manquantes = [...cles].filter((c) => !texte.includes(`"${c}":`));
      expect(manquantes, `clés absentes en ${L}`).toEqual([]);
    });
  }

  it('branche les écrans', () => {
    expect(source('../../components/v2/AlbumDetailV2.svelte')).toContain('<NotesPochetteIaV2');
    expect(source('../../components/v2/SupportV2.svelte')).toContain('<DiagnosticIaV2');
    expect(source('../../components/v2/SupportV2.svelte')).toContain('joindreResumeIa = $state(false)');
    expect(source('../../components/v2/CollectionSmartEditeurV2.svelte')).toContain('<CollectionIaV2');
    expect(source('../../components/v2/CollectionsV2.svelte')).toContain("import('./PropositionsCollectionsIaV2.svelte')");
    expect(source('../../components/v2/CollectionsV2.svelte')).toContain("import('./PourquoiAlbumIaV2.svelte')");
  });
});
