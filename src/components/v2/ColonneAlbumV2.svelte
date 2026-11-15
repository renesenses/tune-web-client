<script lang="ts">
  /**
   * La colonne de droite de la fiche album — maquette de Levente (Figma
   * 611:5805, rc12) : l'artiste, les interprètes, les détails de l'album et
   * ses autres albums.
   *
   * 🔴 AUCUNE donnée inventée : chaque bloc lit une route qui existe déjà
   * (`/library/artists/{id}`, `/library/albums/{id}/credits`,
   * `/library/artists/{id}/albums`) et DISPARAÎT quand elle ne rend rien —
   * pas de zéro, pas de texte de remplissage. Une route absente ou en
   * erreur vaut « rien » : la colonne ne pose aucun bandeau.
   */
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import type { Album, Artist } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import { chargerCreditsAlbum } from '../../lib/library/chargerCredits';
  import {
    autresAlbumsDeLArtiste, detailsAlbum, interpretesAlbum, portraitsInterpretes, type Interprete,
  } from '../../lib/ficheAlbumMaquette';
  import { initialesArtiste } from '../../lib/initialesArtiste';
  import { ARTISTES_A_LIRE } from '../../lib/libraryNavigation';

  interface Props {
    /** L'album affiché ; `id` nul (service, dépôt) : seuls les détails restent. */
    album: Album;
    /** L'identifiant LOCAL de l'artiste, s'il est connu. */
    artistId: number | null;
    nomArtiste: string;
    /** Le texte d'année que l'en-tête affiche déjà. */
    annee: string | null;
    /** Les pistes de l'album, pour le repli des crédits piste par piste. */
    pistes: Array<{ id?: number | null; title?: string | null; track_number?: number | null; disc_number?: number | null }>;
    /** Les versions de la même œuvre (#7617) : pas de doublon dans « Plus de… ». */
    exclus?: number[];
    /** Les crédits sont-ils lisibles (album de la bibliothèque) ? */
    avecCredits: boolean;
    onArtiste?: (() => void) | null;
    onAlbum: (id: number) => void;
    onCredits?: (() => void) | null;
  }
  let { album, artistId, nomArtiste, annee, pistes, exclus = [], avecCredits, onArtiste = null, onAlbum, onCredits = null }: Props = $props();

  let artiste = $state.raw<Artist | null>(null);
  let autres = $state.raw<Album[]>([]);
  let interpretes = $state.raw<Interprete[]>([]);
  /** Portrait de la bibliothèque par nom d'interprète ; absent : initiales. */
  let portraits = $state.raw<Record<string, string>>({});
  let blocInterpretes = $state<HTMLElement | null>(null);

  /**
   * Les portraits se lisent PARESSEUSEMENT : quand le bloc entre à l'écran
   * (sur un téléphone, il est sous les pistes). Sans `IntersectionObserver`,
   * tout de suite. Une recherche par interprète, six au plus : le serveur n'a
   * pas de route groupée par noms.
   */
  $effect(() => {
    const el = blocInterpretes, liste = interpretes;
    portraits = {};
    if (!el || !liste.length) return;
    let vivant = true;
    const charger = () => {
      void portraitsInterpretes(liste.map((p) => p.nom), async (n) => {
        try { return await api.searchLibrary(n, ARTISTES_A_LIRE); } catch { return null; }
      }).then((p) => { if (vivant) portraits = p; });
    };
    if (typeof IntersectionObserver === 'undefined') { charger(); return () => { vivant = false; }; }
    const io = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) { io.disconnect(); charger(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { vivant = false; io.disconnect(); };
  });

  $effect(() => {
    const id = artistId;
    artiste = null; autres = [];
    if (id == null) return;
    let vivant = true;
    (async () => {
      try { const a = await api.getArtist(id); if (vivant) artiste = a; } catch { /* bloc masqué */ }
    })();
    (async () => {
      try { const l = await api.getArtistAlbums(id); if (vivant) autres = Array.isArray(l) ? l : []; } catch { /* bloc masqué */ }
    })();
    return () => { vivant = false; };
  });

  $effect(() => {
    const id = album.id, ok = avecCredits, p = pistes;
    interpretes = [];
    if (id == null || !ok) return;
    let vivant = true;
    (async () => {
      try {
        const c = await chargerCreditsAlbum(id, p as any);
        if (vivant) interpretes = interpretesAlbum(Array.isArray(c) ? c : [], (k) => $tr(k as any));
      } catch { /* bloc masqué */ }
    })();
    return () => { vivant = false; };
  });

  const bio = $derived((artiste?.bio ?? '').trim());
  const details = $derived(detailsAlbum(album as any, annee));
  const plusDe = $derived(autresAlbumsDeLArtiste(autres, [...(album.id != null ? [album.id] : []), ...exclus]));
  const nom = $derived(nomArtiste || artiste?.name || '');
</script>

<aside class="colonne" data-colonne-album aria-label={$tr('v2.album.fiche.details' as any)}>
  {#if artiste && (bio || artiste.image_path)}
    <section class="bloc artiste" data-bloc-artiste>
      {#if artiste.image_path}
        <div class="portrait"><AlbumArt coverPath={artiste.image_path} size={0} recadrer alt={nom} fallbackInitials={nom.slice(0, 1)} /></div>
      {/if}
      <div class="texte">
        <h2>{$tr('v2.album.fiche.about' as any).replace('{artist}', nom)}</h2>
        {#if bio}<p class="bio" title={bio}>{bio}</p>{/if}
        {#if onArtiste}
          <button type="button" class="lien" data-voir-artiste onclick={onArtiste}>{$tr('v2.album.fiche.viewArtist' as any)} ›</button>
        {/if}
      </div>
    </section>
  {/if}

  {#if interpretes.length}
    <section class="bloc" data-bloc-interpretes bind:this={blocInterpretes}>
      <h2>
        {#if onCredits}
          <button type="button" class="titre-lien" onclick={onCredits}>{$tr('v2.album.fiche.recording' as any)}</button>
        {:else}{$tr('v2.album.fiche.recording' as any)}{/if}
      </h2>
      <ul class="interpretes">
        {#each interpretes as p (p.artist_id ?? p.nom)}
          <li data-interprete={p.nom}>
            <span class="avatar" data-portrait={portraits[p.nom] ? '' : undefined}>
              {#if portraits[p.nom]}
                <AlbumArt coverPath={portraits[p.nom]} size={0} recadrer round alt={p.nom} fallbackInitials={initialesArtiste(p.nom)} />
              {:else}
                <span class="initiales" aria-hidden="true">{initialesArtiste(p.nom)}</span>
              {/if}
            </span>
            <span class="inom">{p.nom}</span>
            <span class="irole">{p.roles.join(', ')}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if details.length}
    <section class="bloc" data-bloc-details>
      <h2>{$tr('v2.album.fiche.details' as any)}</h2>
      <dl class="grille">
        {#each details as d (d.cle)}
          <dt>{$tr(d.cle as any)}</dt><dd>{d.valeur}</dd>
        {/each}
      </dl>
    </section>
  {/if}

  {#if plusDe.length}
    <section class="bloc" data-bloc-plus-de>
      <div class="bloc-tete">
        <h2>{$tr('v2.album.fiche.moreFrom' as any).replace('{artist}', nom)}</h2>
        {#if onArtiste}
          <button type="button" class="lien" data-tout-voir onclick={onArtiste}>{$tr('v2.album.fiche.seeAll' as any)} ›</button>
        {/if}
      </div>
      <div class="vignettes">
        {#each plusDe as a (a.id)}
          <div class="vignette">
            <PochetteActions favori={a.id != null ? { albumId: a.id } : null} onOuvrir={() => onAlbum(a.id!)} nom={a.title}>
              <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} vignette alt={a.title} fallbackInitials={a.title?.slice(0, 1)} />
            </PochetteActions>
            <button type="button" class="vtitre" onclick={() => onAlbum(a.id!)} title={a.title}>{a.title}</button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</aside>

<style>
  .colonne{display:flex; flex-direction:column; gap:0; min-width:0; color:var(--v2-txt); font-family:var(--v2-sans)}
  .bloc{padding:16px 0; border-bottom:1px solid var(--v2-line2)}
  .bloc:first-child{padding-top:0}
  .bloc:last-child{border-bottom:0}
  h2{margin:0 0 10px; font:600 calc(17px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  .artiste{display:flex; gap:16px; align-items:flex-start}
  .portrait{width:120px; height:120px; flex:0 0 auto; border-radius:6px; overflow:hidden}
  .texte{min-width:0; display:flex; flex-direction:column; gap:8px}
  .texte h2{margin:0}
  .bio{margin:0; color:var(--v2-txt2); font-size:calc(13px * var(--v2-txt-echelle, 1)); line-height:1.5;
    display:-webkit-box; -webkit-line-clamp:5; line-clamp:5; -webkit-box-orient:vertical; overflow:hidden}
  .lien, .titre-lien{all:unset; cursor:pointer; color:var(--v2-acc-tint); font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .titre-lien{color:inherit; font:inherit}
  .lien:hover, .titre-lien:hover{text-decoration:underline}
  .lien:focus-visible, .titre-lien:focus-visible, .vtitre:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px; border-radius:4px}
  .grille{display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:4px 16px; margin:0;
    font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .grille dt{color:var(--v2-txt2); overflow-wrap:anywhere}
  .grille dd{margin:0; color:var(--v2-txt); overflow-wrap:anywhere}
  .interpretes{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px;
    font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .interpretes li{display:grid; grid-template-columns:32px minmax(0,1fr) minmax(0,1fr); align-items:center; gap:10px}
  .avatar{width:32px; height:32px; border-radius:50%; overflow:hidden; background:var(--v2-surface2);
    display:flex; align-items:center; justify-content:center}
  .initiales{font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2)}
  .inom{color:var(--v2-txt); overflow-wrap:anywhere}
  .irole{color:var(--v2-txt2); overflow-wrap:anywhere}
  .bloc-tete{display:flex; align-items:baseline; justify-content:space-between; gap:12px}
  .bloc-tete h2{min-width:0}
  .bloc-tete .lien{flex:0 0 auto; white-space:nowrap}
  .vignettes{display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px}
  .vignette{display:flex; flex-direction:column; gap:6px; min-width:0}
  .vtitre{all:unset; cursor:pointer; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .vtitre:hover{color:var(--v2-txt)}
</style>
