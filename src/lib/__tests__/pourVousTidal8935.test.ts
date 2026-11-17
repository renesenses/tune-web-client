/**
 * tune-server-rust#8935 — TIDAL « Pour vous » (onglet de Streaming › TIDAL)
 * et titres recommandés sous une playlist TIDAL. Réponses du serveur
 * simulées : aucun appel réseau.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chargerPourVous, chargerRecommandations, decalageSuivant, pageEpuisee, proposeDesRecommandations,
  proposePourVous, RECOMMANDES_PAR_PAGE,
} from '../pourVousTidal';

const lireFichier = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8').replace(/<!--[\s\S]*?-->/g, '');

const reponsePourVous = {
  source: 'for_you',
  rows: [
    {
      id: 'm-albums', title: 'Suggested new albums for you', subtitle: 'Based on your listening',
      albums: [{ source_id: '111', title: 'Album Un' }, { source_id: '', title: 'sans id' }],
      playlists: [], artists: [], tracks: [],
    },
    { id: 'm-vide', title: 'Rangée vide', albums: [], playlists: [], artists: [], tracks: [] },
    { id: 'm-sans-titre', title: '  ', albums: [{ source_id: '9', title: 'x' }] },
    {
      id: 'm-mele', title: 'Because you listened',
      playlists: [{ source_id: 'mix:00cc', name: 'Daily Discovery' }],
      tracks: [{ source_id: '900002', title: 'Piste Deux' }],
      artists: [{ id: '55', name: 'Artiste C' }],
    },
  ],
};

describe('#8935 — la page « Pour vous »', () => {
  it('🔴 rend les rangées du serveur, éléments rattachés au service', async () => {
    const lire = vi.fn(async () => reponsePourVous);
    const page = await chargerPourVous('tidal', lire);
    expect(lire).toHaveBeenCalledWith('tidal');
    expect(page?.source).toBe('for_you');
    expect(page?.rows.map((r) => r.title)).toEqual(['Suggested new albums for you', 'Because you listened']);
    expect(page?.rows[0].albums.map((a) => a.source_id)).toEqual(['111']);
    expect(page?.rows[0].subtitle).toBe('Based on your listening');
    // La lecture et la file passent par `source` + `source_id`, comme partout.
    expect(page?.rows[1].tracks[0]).toMatchObject({ source: 'tidal', source_id: '900002' });
    expect(page?.rows[1].playlists[0]).toMatchObject({ source: 'tidal', source_id: 'mix:00cc' });
    expect(page?.rows[1].artists[0]).toMatchObject({ source: 'tidal', id: '55' });
  });

  it('un échec (route absente, refus, panne) se distingue d’une page vide', async () => {
    expect(await chargerPourVous('tidal', async () => { throw new Error('HTTP 501'); })).toBeNull();
    expect(await chargerPourVous('tidal', async () => ({ source: 'home', rows: [] }))).toEqual({ source: 'home', rows: [] });
    expect(await chargerPourVous('tidal', async () => null)).toEqual({ source: '', rows: [] });
  });

  it('les autres services ne demandent rien', async () => {
    const lire = vi.fn(async () => reponsePourVous);
    expect(await chargerPourVous('qobuz', lire)).toEqual({ source: '', rows: [] });
    expect(lire).not.toHaveBeenCalled();
    expect(proposePourVous('tidal')).toBe(true);
    expect(proposePourVous('qobuz')).toBe(false);
  });
});

describe('#8935 — les titres recommandés d’une playlist', () => {
  const pl = { source_id: '1f2e3d4c-0000-1111-2222-333344445555' };

  it('🔴 demande une page de dix à partir du décalage, titres rattachés au service', async () => {
    const lire = vi.fn(async () => ({ tracks: [{ source_id: '31', title: 'Reco' }, { title: 'sans id' }], total: 95, offset: 10 }));
    const page = await chargerRecommandations('tidal', pl, 10, lire);
    expect(lire).toHaveBeenCalledWith('tidal', pl.source_id, RECOMMANDES_PAR_PAGE, 10);
    expect(page.tracks).toEqual([{ source_id: '31', title: 'Reco', source: 'tidal' }]);
    expect(page.total).toBe(95);
  });

  it('ni mix, ni autre service, ni playlist sans identifiant : aucun appel', async () => {
    const lire = vi.fn(async () => ({ tracks: [{ source_id: '31' }], total: 1 }));
    expect((await chargerRecommandations('tidal', { source_id: 'mix:00aa' }, 0, lire)).tracks).toEqual([]);
    expect((await chargerRecommandations('qobuz', pl, 0, lire)).tracks).toEqual([]);
    expect((await chargerRecommandations('tidal', { source_id: '' }, 0, lire)).tracks).toEqual([]);
    expect(lire).not.toHaveBeenCalled();
    expect(proposeDesRecommandations('tidal', pl)).toBe(true);
  });

  it('une route absente ou en panne ne montre rien, sans erreur', async () => {
    await expect(chargerRecommandations('tidal', pl, 0, async () => { throw new Error('HTTP 404'); }))
      .resolves.toEqual({ tracks: [], total: 0, offset: 0 });
  });

  const dix = Array.from({ length: RECOMMANDES_PAR_PAGE }, (_, i) => ({ source_id: String(i) }));

  it('🔴 « Autres suggestions » avance d’une page demandée, sans se fier à `total`', () => {
    expect(decalageSuivant({ tracks: dix, total: 95, offset: 0 })).toBe(10);
    // `total` a diminué entre deux pages : on avance quand même, la fin se
    // lira dans une page vide.
    expect(decalageSuivant({ tracks: dix, total: 20, offset: 20 })).toBe(30);
    // Le contrôle parental a retiré deux titres : on avance de la page
    // DEMANDÉE, pas des huit affichés (qui reservirait les mêmes).
    expect(decalageSuivant({ tracks: dix.slice(2), total: 95, offset: 10 })).toBe(20);
    // Une seule page, incomplète : rien de plus à proposer.
    expect(decalageSuivant({ tracks: dix.slice(0, 8), total: 8, offset: 0 })).toBeNull();
  });

  it('🔴 une page vide au-delà de la première garde la section (« Revenir au début »)', () => {
    expect(pageEpuisee({ tracks: [], total: 95, offset: 100 })).toBe(true);
    expect(pageEpuisee({ tracks: [], total: 0, offset: 0 })).toBe(false);
    expect(pageEpuisee({ tracks: dix, total: 95, offset: 10 })).toBe(false);
    expect(pageEpuisee(null)).toBe(false);
  });
});

describe('#8935 — branchement des écrans', () => {
  it('🔴 l’onglet « Pour vous » de Streaming lit la route du serveur et dessine ses rangées', () => {
    const src = lireFichier('src/components/v2/StreamingV2.svelte');
    expect(src).toContain('chargerPourVous(svc, api.getStreamingForYou)');
    expect(src).toContain("{ id: 'foryou' as Sub, label: $t('v2.stream.forYou' as any) }");
    const debut = src.indexOf("{:else if sub === 'foryou' && ongletPourVous}");
    expect(debut, 'volet « Pour vous » introuvable').toBeGreaterThan(-1);
    const bloc = src.slice(debut, src.indexOf("{:else if sub === 'mine'}", debut));
    expect(bloc).toContain("{@render tile(a, () => playAlbum(a))}");
    expect(bloc).toContain("{@render tile(p, () => playPlaylist(p), 'playlist', () => ouvrirCalquePlaylist(p))}");
    expect(bloc).toContain('lirePourVousDepuis(r.tracks, i)');
    expect(bloc).toContain("$t('v2.stream.forYouFailed' as any)");
    // Deux rangées de même identifiant ne cassent pas le rendu.
    expect(bloc).toContain('{#each pourVous.rows as r, i (`${r.id}:${i}`)}');
  });

  it('🔴 la fiche d’une playlist de service porte les titres recommandés', () => {
    const fiche = lireFichier('src/components/v2/PlaylistDetailV2.svelte');
    expect(fiche).toMatch(/\{#if !loading && item\.kind === 'streaming'\}\s*<RecommandesPlaylistV2 service=\{item\.service\} playlist=\{item\.pl\} \/>/);
    const reco = lireFichier('src/components/v2/RecommandesPlaylistV2.svelte');
    expect(reco).toContain('chargerRecommandations(svc, pl, offset, api.getStreamingPlaylistRecommendations)');
    expect(reco).toContain('lireListeDepuis(page.tracks as any, i, gestesDeZone(zid))');
    // La section reste quand la page est vide, avec « Revenir au début ».
    expect(reco).toContain('{#if visible && (page?.tracks.length || epuisee)}');
    expect(reco).toMatch(/data-revenir-au-debut[\s\S]{0,120}onclick=\{\(\) => charger\(0\)\}/);
    // Rechargement sur l’IDENTIFIANT de la playlist, pas sur l’objet.
    expect(reco).toContain("const idPlaylist = $derived(typeof playlist?.source_id === 'string' ? playlist.source_id : '');");
    expect(reco).not.toMatch(/pl !== playlist/);
  });

  it('les routes appelées sont celles du serveur', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');
    expect(api).toMatch(/export function getStreamingForYou\(service: string\)[\s\S]{0,200}\/streaming\/\$\{encodeURIComponent\(service\)\}\/for-you`/);
    expect(api).toMatch(/export function getStreamingPlaylistRecommendations\([\s\S]{0,300}\/playlists\/\$\{encodeURIComponent\(playlistId\)\}\/recommendations\?limit=\$\{limit\}&offset=\$\{offset\}`/);
  });

  it('chaque langue traduit les sept libellés', () => {
    const dossier = resolve(process.cwd(), 'src/lib/locales');
    const langues = readdirSync(dossier).filter((f) => /^[a-z]{2}\.ts$/.test(f));
    expect(langues.length).toBeGreaterThanOrEqual(15);
    for (const f of langues) {
      const s = readFileSync(resolve(dossier, f), 'utf-8');
      for (const k of ['forYou', 'forYouEmpty', 'forYouFailed', 'recommendedTracks', 'recommendedMore', 'recommendedRestart', 'recommendedHint']) {
        expect(s, `${f} : v2.stream.${k}`).toMatch(new RegExp(`"v2\\.stream\\.${k}": "[^"]+"`));
      }
    }
  });
});
