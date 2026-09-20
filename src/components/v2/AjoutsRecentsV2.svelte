<script lang="ts">
  /**
   * « Ajouts récents » — onglet de la Bibliothèque (#3039), porté de
   * l'ancienne interface, seule à l'offrir.
   *
   * La règle est ÉNONCÉE (« ajoutés depuis N jours »), et le décompte porte sur
   * la MÊME fenêtre que la liste : le serveur les calcule ensemble. Deux
   * fenêtres, 15 et 30 jours, exactement ce que le testeur demandait.
   */
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import { formatDuration } from '../../lib/utils';
  import { notifications } from '../../lib/stores/notifications';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';

  /**
   * `vue` — la bascule grille/liste de la Bibliothèque agit ICI aussi.
   *
   * Jean Valjean, fil 1856, 20/09/2026 : « Il n'est pas possible de choisir
   * liste ou grille. » Le bouton était bien rendu au-dessus de cette vue,
   * mais rien ne descendait jusqu'à elle : un clic sans effet. Une commande
   * affichée doit agir ou ne pas être là ; celle-ci a un sens sur une grille
   * d'albums, on la câble plutôt que de la retirer.
   */
  let { onOuvrir, vue = 'grid' }: { onOuvrir: (a: Album) => void; vue?: 'grid' | 'list' } = $props();

  const FENETRES = [15, 30];
  /** Au-delà, c'est une bibliothèque, pas un « récent ». */
  const PLAFOND = 500;

  let jours = $state(FENETRES[0]);
  let albums = $state<any[]>([]);
  let resume = $state<api.ResumeAjoutsRecents | null>(null);
  let charge = $state(false);

  async function charger(fenetre: number) {
    charge = false;
    try {
      const [items, r] = await Promise.all([
        api.getRecentlyAdded(fenetre, PLAFOND),
        api.getRecentlyAddedSummary(fenetre),
      ]);
      // La fenêtre a changé pendant la requête : ce résultat ne la décrit plus.
      if (jours !== fenetre) return;
      albums = items ?? [];
      resume = r ?? null;
    } catch {
      if (jours !== fenetre) return;
      // Vide et DIT, plutôt qu'une liste d'une autre fenêtre laissée à l'écran.
      albums = [];
      resume = null;
      notifications.error($tr('library.recentLoadError' as any));
    }
    charge = true;
  }
  $effect(() => { void charger(jours); });
</script>

<div class="recents">
  <div class="tete">
    <p class="regle">{$tr('library.recentlyAddedRule' as any).replace('{d}', String(jours))}</p>
    <div class="fenetres">
      {#each FENETRES as j (j)}
        <button class:on={jours === j} onclick={() => (jours = j)}>
          {$tr('library.recentWindowDays' as any).replace('{d}', String(j))}
        </button>
      {/each}
    </div>
    {#if resume}
      <span class="compte">{$tr('library.recentCounts' as any)
        .replace('{a}', String(resume.album_count))
        .replace('{t}', String(resume.track_count))
        .replace('{h}', formatDuration(resume.duration_ms))}</span>
    {/if}
  </div>

  {#if !charge}
    <div class="etat">{$tr('common.loading' as any)}</div>
  {:else if !albums.length}
    <div class="etat">{$tr('library.noRecentAlbums' as any)}</div>
  {:else if vue === 'list'}
    <div class="liste">
      {#each albums as a (a.id)}
        <button class="ligne" onclick={() => onOuvrir(a as Album)}>
          <span class="vign"><AlbumArt coverPath={a.cover_path ?? null} albumId={a.id ?? null} size={0} alt={a.title ?? ''} /></span>
          <span class="ltitre">{a.title ?? ''}</span>
          <span class="lartiste">{a.artist_name ?? ''}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="grille">
      {#each albums as a (a.id)}
        <button class="carte" onclick={() => onOuvrir(a as Album)}>
          <AlbumArt coverPath={a.cover_path ?? null} albumId={a.id ?? null} size={0} alt={a.title ?? ''} />
          <span class="titre">{a.title ?? ''}</span>
          {#if a.artist_name}<span class="artiste">{a.artist_name}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* #1323 — LA VUE PORTE SON PROPRE ASCENSEUR.
     `LibraryV2` pose `.v2-lib{height:100%; overflow:hidden}` et, dedans,
     `.body{flex:1; min-height:0; display:flex}` : le corps est haut comme
     l'écran et COUPE ce qui dépasse. Étirée par `align-items:stretch`, cette
     vue prenait exactement sa hauteur, sa grille débordait, et le débordement
     était effacé — ni ascenseur ni molette sur 2 806 albums (Jean Valjean,
     fils 1855/1856, 0.9.158, Windows/Firefox). Les six autres vues du même
     corps (`.grid`, `.rows`, `.tracklist`, `.facets`, `.fliste`, `.grille`
     d'ArtistesV2) le faisaient déjà ; celle-ci était la seule sans.
     `min-height:0` est indispensable : sans lui l'enfant en flex refuse de
     rétrécir sous la taille de son contenu et l'ascenseur ne s'arme jamais.
     Gouttière de droite : le corps n'en donne qu'à gauche (18 px), et
     l'ascenseur occupe désormais le bord droit. */
  .recents{flex:1; min-width:0; min-height:0; overflow-y:auto; padding:4px 18px 40px 0}
  .recents::-webkit-scrollbar{width:9px}
  .recents::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .tete{display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-bottom:16px}
  .regle{margin:0; font-size:13px; color:var(--v2-txt2)}
  .fenetres{display:flex; gap:6px}
  .fenetres button{padding:5px 11px; border-radius:999px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); font:12px var(--v2-sans); cursor:pointer}
  .fenetres button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); border-color:transparent}
  .compte{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .etat{padding:24px 0; color:var(--v2-txt3); font-size:13px}
  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:16px}
  .carte{display:flex; flex-direction:column; gap:6px; padding:0; border:0; background:transparent; text-align:left; cursor:pointer; color:inherit}

  /* LA VUE LISTE. Mêmes proportions que `.lrow` de la Bibliothèque — vignette
     de 44 px, titre puis artiste — pour que la bascule change la forme et non
     l'écran. Les deux cellules de texte existent TOUJOURS, vides s'il n'y a
     rien à y mettre : posées sous un `{#if}`, une ligne sans artiste n'aurait
     que deux cellules et son titre s'étalerait sur la colonne voisine, le
     désalignement corrigé sur la liste d'albums le 05/09/2026. */
  .liste{display:flex; flex-direction:column; gap:1px}
  .ligne{display:grid; grid-template-columns:44px minmax(0,2fr) minmax(0,1.4fr); align-items:center;
    gap:14px; width:100%; padding:6px 10px; border:0; border-radius:9px; background:transparent;
    color:var(--v2-txt2); cursor:pointer; text-align:left; transition:.12s}
  .ligne:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .vign{width:44px; height:44px; border-radius:6px; overflow:hidden}
  .ltitre{min-width:0; font-size:13.5px; font-weight:600; color:var(--v2-txt);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lartiste{min-width:0; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .titre{font-size:13px; color:var(--v2-txt); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .artiste{font-size:12px; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
</style>
