/**
 * Assistant IA, étape 2 (tune-server-rust, chantier « assistant-ia »).
 *
 * Ce que l'écran doit tenir, sans serveur :
 *  - un lot est borné et sans doublon, et l'arrêt au plafond arrive en
 *    DONNÉE (`arret`, `non_traites`), pas en exception ;
 *  - les lignes cochées d'un lot partent regroupées par album ;
 *  - le message d'une application dit ce que le serveur a fait des pistes ;
 *  - les réglages ne s'affichent en formulaire qu'à un administrateur ;
 *  - les branchements : le lot dans la Bibliothèque, les pistes sur la fiche.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ResultatLotIa, ReglagesIa } from '../assistantIa';

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
const notifier = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() };
vi.mock('../stores/notifications', () => ({ notifications: notifier }));

const ia = await import('../assistantIa');

const source = (chemin: string) =>
  readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

function repondre(status: number, corps: unknown) {
  const texte = JSON.stringify(corps);
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers(),
    text: async () => texte,
    json: async () => corps,
  });
}

describe('Assistant IA étape 2 — lot', () => {
  it('un lot est sans doublon, sans album sans identifiant, et borné à 50', () => {
    expect(ia.idsDuLot([3, null, 3, 7, undefined, 9])).toEqual([3, 7, 9]);
    const cent = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(ia.idsDuLot(cent)).toHaveLength(ia.LOT_MAX);
    expect(ia.LOT_MAX).toBe(50);
  });

  it("l'arrêt au plafond arrive en donnée, avec les albums non soumis", async () => {
    const f = repondre(200, {
      ok: true,
      resultats: [{ ok: true, album_id: 1, titre: 'A', suggestions: [], ecartees: [], depuis_cache: false, cout_eur: 0.1 }],
      arret: { error: 'plafond_atteint', message: 'Plafond' },
      non_traites: [2, 3],
      cout_eur: 0.1,
    });
    vi.stubGlobal('fetch', f);
    const r = await ia.lotSuggestionsIa([1, 2, 3], '0,50');
    expect(ia.estEchec(r)).toBe(false);
    if (ia.estEchec(r)) return;
    expect(r.arret?.error).toBe('plafond_atteint');
    expect(r.non_traites).toEqual([2, 3]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain('/ext/assistant-ia/lot/suggestions');
    expect(JSON.parse(init.body)).toEqual({ album_ids: [1, 2, 3], budget_eur: '0,50' });
  });

  it('les lignes cochées partent regroupées par album, les albums en échec sont ignorés', () => {
    const resultats: ResultatLotIa[] = [
      { ok: true, album_id: 1, titre: 'A', depuis_cache: false, cout_eur: 0, ecartees: [], suggestions: [
        { champ: 'genre', avant: null, apres: 'Jazz', confiance: 0.9, raison: null },
        { champ: 'label', avant: null, apres: 'Blue Note', confiance: 0.5, raison: null },
      ] },
      { ok: false, album_id: 2, error: 'album_introuvable', message: '' },
      { ok: true, album_id: 3, titre: 'C', depuis_cache: false, cout_eur: 0, ecartees: [], suggestions: [
        { champ: 'genre', avant: 'Rock', apres: 'Blues', confiance: 0.8, raison: null },
      ] },
    ];
    const cochees = new Set([ia.cleDeLigneDuLot(1, 'genre'), ia.cleDeLigneDuLot(3, 'genre')]);
    expect(ia.lignesDuLot(resultats, cochees)).toEqual([
      { album_id: 1, lignes: [{ champ: 'genre', valeur: 'Jazz' }] },
      { album_id: 3, lignes: [{ champ: 'genre', valeur: 'Blues' }] },
    ]);
  });
});

describe('Assistant IA étape 2 — pistes et genre', () => {
  it('le message dit le genre recopié, la compilation épargnée et les pistes laissées', () => {
    const t = (k: string) => ({
      'assistantIa.album.genreTracks': 'Genre recopié sur {n} piste(s).',
      'assistantIa.album.compilationSpared': 'Compilation épargnée.',
      'assistantIa.album.tracksKept': '{n} laissée(s).',
    } as Record<string, string>)[k] ?? k;
    const base = { appliquees: [], refusees: [], operation_id: null };
    expect(ia.messageDeRapport('1 appliquée.', { ...base, pistes_genre: 12 }, t))
      .toBe('1 appliquée. Genre recopié sur 12 piste(s).');
    expect(ia.messageDeRapport('Annulé.', { ...base, pistes_genre: 3, pistes_modifiees_depuis: 1 }, t))
      .toBe('Annulé. Genre recopié sur 3 piste(s). 1 laissée(s).');
    expect(ia.messageDeRapport('1 appliquée.', { ...base, compilation_epargnee: true }, t))
      .toBe('1 appliquée. Compilation épargnée.');
    expect(ia.messageDeRapport('Rien.', base, t)).toBe('Rien.');
  });

  it('les lignes de piste partent avec leur piste_id', async () => {
    const f = repondre(200, { ok: true, rapport: { appliquees: [], refusees: [], operation_id: null } });
    vi.stubGlobal('fetch', f);
    await ia.appliquerPistesIa(10, [{ piste_id: 101, champ: 'movement', valeur: 'I. Allegro' }]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain('/ext/assistant-ia/albums/10/pistes/appliquer');
    expect(JSON.parse(init.body)).toEqual({ lignes: [{ piste_id: 101, champ: 'movement', valeur: 'I. Allegro' }] });
  });

  it('les nouvelles raisons et les nouveaux codes ont leur phrase', () => {
    for (const r of ['deja_rempli', 'piste_inconnue', 'reference_inconnue', 'reference_ambigue']) {
      expect(ia.cleDeRaison(r)).toBe(`assistantIa.raison.${r}`);
    }
    for (const c of ['admin_requis', 'lot_invalide', 'budget_du_lot_atteint']) {
      expect(ia.cleDEchec(c)).toBe(`assistantIa.err.${c}`);
    }
  });
});

describe('Assistant IA étape 2 — réglages réservés aux administrateurs', () => {
  it('modifiable faux cache le formulaire ; un serveur de l’étape 1 (sans le champ) le garde', () => {
    const r = { consommation: {}, plafond_eur: 2 } as unknown as ReglagesIa;
    expect(ia.peutModifier({ ...r, modifiable: false })).toBe(false);
    expect(ia.peutModifier({ ...r, modifiable: true })).toBe(true);
    expect(ia.peutModifier(r)).toBe(true);
    expect(ia.peutModifier(null)).toBe(false);
  });

  it('un refus 403 admin_requis arrive en donnée, sans déconnexion', async () => {
    vi.stubGlobal('fetch', repondre(403, { ok: false, error: 'admin_requis', message: 'x' }));
    const r = await ia.changerReglagesIa({ plafond_eur: 5 });
    expect(ia.estEchec(r)).toBe(true);
    if (ia.estEchec(r)) expect(r.error).toBe('admin_requis');
  });

  it('le composant des réglages branche la garde sur `peutModifier`', () => {
    const c = source('../../components/v2/AssistantIaReglagesV2.svelte');
    expect(c).toContain('{#if r && !peutModifier(r)}');
    expect(c).toContain('data-ia-admin-requis');
  });
});

describe('Assistant IA étape 2 — branchements', () => {
  it('la Bibliothèque ouvre le lot sur les albums affichés', () => {
    const lib = source('../../components/v2/LibraryV2.svelte');
    expect(lib).toContain('data-suggestions-ia-lot-ouvrir');
    expect(lib).toContain('<SuggestionsIaLotV2');
    expect(lib).toContain('idsDuLot(affiches.map((a) => a.id))');
  });

  it('la fenêtre de l’album propose les pistes', () => {
    const c = source('../../components/v2/SuggestionsIaAlbumV2.svelte');
    expect(c).toContain('data-ia-pistes');
    expect(c).toContain('suggestionsPistesIa(albumId)');
  });
});
