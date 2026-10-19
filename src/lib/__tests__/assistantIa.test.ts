/**
 * Assistant IA, étape 1 (tune-server-rust, chantier « assistant-ia »).
 *
 * Ce que l'écran doit tenir, sans serveur :
 *  - un échec fonctionnel (plafond atteint, clé refusée…) arrive en DONNÉE,
 *    pas en exception ni en bandeau « Server error » ;
 *  - chaque code et chaque raison que le serveur peut rendre a sa phrase,
 *    en français et en anglais ;
 *  - les branchements : la section des Réglages, le bouton de la fiche album,
 *    la fenêtre « une phrase » de l'écran Playlists.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fr as frBrut, en as enBrut } from './onzeDictionnaires';

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
const notifier = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() };
vi.mock('../stores/notifications', () => ({ notifications: notifier }));

const ia = await import('../assistantIa');
const fr = frBrut as unknown as Record<string, string>;
const en = enBrut as unknown as Record<string, string>;
const { V2_SETTINGS } = await import('../v2Settings');

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

const source = (chemin: string) =>
  readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

describe('Assistant IA — client', () => {
  it('un plafond atteint arrive en donnée, sans bandeau', async () => {
    const f = repondre(409, { ok: false, error: 'plafond_atteint', message: 'Plafond…' });
    vi.stubGlobal('fetch', f);
    const r = await ia.proposerPlaylistIa('jazz calme des années 60');
    expect(ia.estEchec(r)).toBe(true);
    expect(ia.estEchec(r) && r.error).toBe('plafond_atteint');
    expect(notifier.error).not.toHaveBeenCalled();
    const [url, options] = f.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/ext\/assistant-ia\/playlist$/);
    expect(JSON.parse(options.body)).toEqual({ phrase: 'jazz calme des années 60', cible: 'playlist' });
  });

  it('une réponse rendue passe telle quelle', async () => {
    vi.stubGlobal('fetch', repondre(200, {
      ok: true, depuis_cache: true, cout_eur: 0,
      proposition: { name: 'x', match_mode: 'all', rules: [], sort_by: null, sort_order: null, max_tracks: null, untranslated: [], refusees: [] },
    }));
    const r = await ia.proposerPlaylistIa('x');
    expect(ia.estEchec(r)).toBe(false);
  });

  it('la clé ne part que vers PUT /reglages, jamais vers une autre route', async () => {
    const f = repondre(200, {});
    vi.stubGlobal('fetch', f);
    await ia.changerReglagesIa({ fournisseur: 'gemini', cle: 'AIza-secret' });
    await ia.testerCleIa();
    await ia.suggestionsAlbumIa(7);
    const corps = f.mock.calls.map(([u, o]) => [u, o?.body ?? ''] as [string, string]);
    expect(corps[0][0]).toMatch(/\/ext\/assistant-ia\/reglages$/);
    expect(corps.slice(1).every(([, b]) => !String(b).includes('AIza-secret'))).toBe(true);
  });

  it('chaque code, raison et champ connu a sa phrase en français et en anglais', () => {
    const cles = [
      ...ia.CODES_ECHEC.map((c) => ia.cleDEchec(c)),
      ia.cleDEchec('inconnu'),
      ...ia.RAISONS.map((r) => ia.cleDeRaison(r)),
      ia.cleDeRaison('inconnue'),
      ...ia.CHAMPS_ALBUM.map((c) => ia.cleDeChamp(c)),
      ia.cleDeChamp('inconnu'),
      ...(['anthropic', 'gemini', 'compatible_openai', 'ollama'] as const).map((p) => `assistantIa.provider.${p}`),
    ];
    const manquantes = cles.filter((k) => !fr[k] || !en[k]);
    expect(manquantes).toEqual([]);
  });

  it('une réponse de réglages mal formée est ignorée', () => {
    expect(ia.estReglages({})).toBe(false);
    expect(ia.estReglages(undefined)).toBe(false);
    expect(ia.estReglages({ plafond_eur: 2, consommation: { mois: '2026-10' } })).toBe(true);
  });

  it('les aides de l’écran', () => {
    expect(ia.valeurLisible([1960, 1969])).toBe('1960 – 1969');
    expect(ia.valeurLisible(null)).toBe('');
    expect(ia.pourcent(0.876)).toBe(88);
    expect(ia.pourcent(3)).toBe(100);
    const s = [
      { champ: 'genre', avant: null, apres: 'Jazz', confiance: 0.9, raison: null },
      { champ: 'label', avant: null, apres: 'X', confiance: 0.4, raison: null },
    ];
    expect([...ia.cocheesParDefaut(s)]).toEqual(['genre']);
  });
});

describe('Assistant IA — branchements', () => {
  it('Réglages ▸ Assistant IA existe et a sa branche de rendu', () => {
    const section = V2_SETTINGS.flatMap((o) => o.sections).find((s) => s.id === 'assistantIa');
    expect(section?.titleKey).toBe('assistantIa.title');
    expect(source('../../components/v2/SettingsV2.svelte')).toContain('<AssistantIaReglagesV2 />');
  });

  it('la fiche album porte le bouton « Suggestions IA »', () => {
    const fiche = source('../../components/v2/AlbumDetailV2.svelte');
    expect(fiche).toContain('data-suggestions-ia-album');
    expect(fiche).toContain('<SuggestionsIaAlbumV2');
  });

  it("l'écran Playlists ouvre la fenêtre « une phrase » et passe la proposition à l'éditeur", () => {
    const ecran = source('../../components/v2/PlaylistsV2.svelte');
    expect(ecran).toContain('data-playlist-ia');
    expect(ecran).toContain("import('./PlaylistParPhraseV2.svelte')");
    expect(ecran).toContain('propose={cibleSmart.propose ?? null}');
    // L'éditeur ne crée rien seul : il pré-remplit, l'utilisateur enregistre.
    const editeur = source('../../components/v2/PlaylistSmartEditeurV2.svelte');
    expect(editeur).toContain('if (id != null || !propose) return;');
  });
});
