// Recette de Bertrand sur le .18 (14/11/2026), album UPnP « MIRRORS OF TIME -
// Tribute Reflections » :
//  1. la section « Autres » de l'inspecteur d'Oxygen montrait les témoins
//     internes du serveur (`mb_resolve_tried`, `upnp_*`) comme des balises ;
//  2. la colonne « # » affichait « 0 » sur chaque piste sans numéro.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { estCleMetadonneeInterne, metadonneesVisibles } from '../clesMetadonneesInternes';
import { comparerNumeroPiste, numeroPisteAffiche } from '../numeroPiste';

const lire = (p: string) => readFileSync(p, 'utf8');

describe('les clés internes de track_metadata', () => {
  it('le relevé du .18 : tous les témoins disparaissent, rien d’autre', () => {
    const servi = {
      mb_resolve_tried: '1794043157',
      upnp_cover_url: 'http://192.168.1.15:8888/api/v1/library/artwork/abc',
      upnp_object_id: 'track/518665',
      upnp_res_url: 'http://192.168.1.15:8888/api/v1/tracks/518665/audio',
      upnp_serveur: 'uuid:0b1e7a2c-0000-0000-0000-000000000000',
      upnp_serveur_nom: 'Tune Server',
      comment: 'Remaster 2024',
      catalog_number: 'MOT-001',
    };
    expect(metadonneesVisibles(servi)).toEqual({ comment: 'Remaster 2024', catalog_number: 'MOT-001' });
  });

  it('écarte les témoins des analyses, garde leurs mesures', () => {
    for (const k of [
      'rg_analyzed', 'rg_path_unresolved', 'rg_skipped_oversized', 'rg_track_source', 'rg_album_source',
      'rg_algo', 'rg_true_peak_algo', 'dr_source', 'dr_indisponible', 'dr_algo',
      'audio_embed_analyzed', 'audio_embed_path_unresolved', 'mb_extra_synced', 'mb_extra_pushed',
      'credits_source', 'champs_tenus', 'UPNP_OBJECT_ID',
    ]) expect(estCleMetadonneeInterne(k), k).toBe(true);
    for (const k of [
      'rg_track_gain', 'rg_track_peak', 'rg_album_gain', 'rg_album_peak', 'rg_track_true_peak',
      'dr_track', 'dr_album', 'comment', 'isrc', 'catalog_number', 'barcode', 'label', 'mood',
      'source_media', 'release_country', 'mb_release_track_id', 'mb_track_id', 'encoder_software',
      'lyrics', 'conductor',
    ]) expect(estCleMetadonneeInterne(k), k).toBe(false);
  });

  it('l’inspecteur d’Oxygen filtre ce que sert le serveur', () => {
    expect(lire('src/components/v2-heritage/OxygenView.svelte'))
      .toContain('ext = metadonneesVisibles(await getTrackExtendedMetadata(t.id));');
  });
});

describe('le numéro de piste', () => {
  it('0, absent, vide ou négatif : case vide', () => {
    for (const n of [0, '0', null, undefined, '', -1, Number.NaN]) expect(numeroPisteAffiche(n as any), String(n)).toBe('');
    expect(numeroPisteAffiche(7)).toBe('7');
    expect(numeroPisteAffiche('12')).toBe('12');
  });

  it('les pistes sans numéro passent après les numérotées, dans l’ordre servi', () => {
    const pistes = [
      { id: 1, track_number: 0 }, { id: 2, track_number: 3 }, { id: 3, track_number: null },
      { id: 4, track_number: 1 }, { id: 5, track_number: 0 },
    ];
    const ordre = [...pistes].sort((a, b) => comparerNumeroPiste(a.track_number, b.track_number)).map((p) => p.id);
    expect(ordre).toEqual([4, 2, 1, 3, 5]);
  });

  it('les listes passent par numeroPisteAffiche, plus aucune n’affiche « 0 »', () => {
    const oxy = lire('src/components/v2-heritage/OxygenView.svelte');
    expect(oxy).not.toContain('t.track_number ?? \'\'');
    expect(oxy.match(/\{numeroPisteAffiche\(t\.track_number\)\}/g)?.length).toBe(2);
    expect(oxy).toContain("get: t => numeroPisteAffiche(t.track_number) }");
    expect(oxy).toContain('d.tracks.sort((a, b) => comparerNumeroPiste(a.track_number, b.track_number))');
    expect(lire('src/components/v2-heritage/BrowseView.svelte')).toContain('{numeroPisteAffiche(t.track_number) || index + 1}');
    expect(lire('src/components/v2/EnrichissementAlbumV2.svelte')).toContain('{numeroPisteAffiche(p.track_number)}');
    expect(lire('src/components/partages/AlbumEditModal.svelte')).toContain("{numeroPisteAffiche(t.track_number) || '—'}");
  });
});
