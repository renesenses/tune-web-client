<script lang="ts">
  /**
   * Tune Circle T5 — « Ajouter à une playlist de cercle », depuis le menu
   * « … » d'un titre (renesenses/tune-server-rust#5328).
   *
   * Ce qui part, et rien d'autre (`ajoutDePiste`) :
   * - une piste de la BIBLIOTHÈQUE : son seul `track_id` ; le greffon bâtit
   *   la référence (titre, artiste, album, durée, ISRC, identifiants de
   *   service) sans `source_id` ni chemin ;
   * - une piste de SERVICE : une référence en liste blanche, l'identifiant
   *   rangé sous le nom de son service (`qobuz_id`, `tidal_id`…).
   *
   * Tout membre ajoute. L'ajout porte la `version` connue ; un 409 relit la
   * version et refait l'ajout une fois — un ajout garde toujours son sens.
   */
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { motifCercle } from '../../lib/circle';
  import {
    listerPlaylistsCercle, ajouterMorceaux, lirePlaylistCercle, estConflit, etatDuConflit, codeT5, NOM_PLAYLIST_MAX,
    type Ajout, type PlaylistCercleResume,
  } from '../../lib/circlePlaylists';

  interface Props {
    ajout: Ajout;
    titre: string;
    onClose: () => void;
  }
  let { ajout, titre, onClose }: Props = $props();

  let playlists = $state<PlaylistCercleResume[] | null>(null);
  let erreur = $state<string | null>(null);
  let occupe = $state<string | null>(null);

  function phrase(e: unknown): string {
    const cle = codeT5(e);
    if (cle) return $t(cle as any).replace('{max}', String(NOM_PLAYLIST_MAX));
    const m = motifCercle(e);
    const s = $t(m.cle as any);
    return m.minutes != null ? s.replace('{n}', String(m.minutes)) : s;
  }

  async function charger() {
    try {
      playlists = await listerPlaylistsCercle();
      erreur = null;
    } catch (e) {
      playlists = [];
      // 404 : un greffon d'avant T5 (route absente) — rien à proposer, sans alarme.
      erreur = (e as { status?: number })?.status === 404 ? null : phrase(e);
    }
  }

  async function choisir(p: PlaylistCercleResume) {
    if (occupe !== null) return;
    occupe = String(p.id);
    erreur = null;
    try {
      try {
        await ajouterMorceaux(p.id, ajout, p.version);
      } catch (e) {
        if (!estConflit(e)) throw e;
        const version = etatDuConflit(e)?.version ?? (await lirePlaylistCercle(p.id)).version;
        await ajouterMorceaux(p.id, ajout, version);
      }
      notifications.success($t('v2.circle.pl.added' as any).replace('{title}', titre).replace('{name}', p.name));
      onClose();
    } catch (e) {
      // Un 404 : la playlist n'est plus partagée avec moi — la liste est relue.
      if ((e as { status?: number })?.status === 404) {
        await charger();
        erreur = $t('v2.circle.pl.gone' as any);
      } else erreur = phrase(e);
    } finally {
      occupe = null;
    }
  }

  function surFond(e: MouseEvent) { if (e.target === e.currentTarget) onClose(); }
  function surTouche(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }

  $effect(() => { void charger(); });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fond-ajout-cercle" onclick={surFond} onkeydown={surTouche}>
  <div class="boite tune-v2" role="dialog" aria-modal="true" aria-labelledby="ajout-cercle-titre">
    <header class="tete">
      <h3 id="ajout-cercle-titre">{$t('v2.circle.pl.addToCircle' as any)}</h3>
      <button class="lnk fermer" onclick={onClose} aria-label={$t('common.close' as any)}>×</button>
    </header>
    <p class="note">{$t('v2.circle.pl.addHint' as any)}</p>
    {#if playlists === null}
      <div class="note">{$t('v2.tool.loading' as any)}</div>
    {:else if playlists.length === 0 && !erreur}
      <p class="note vide">{$t('v2.circle.pl.noneToAdd' as any)}</p>
    {:else}
      <ul class="choix">
        {#each playlists as p (String(p.id))}
          <li>
            <button class="ligne choix-playlist" disabled={occupe !== null} onclick={() => void choisir(p)}>
              <span class="nom">{p.name}</span>
              <span class="note">{$t('v2.circle.pl.count' as any).replace('{n}', String(p.count))}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if erreur}
      <p class="err" role="alert">{erreur}</p>
    {/if}
  </div>
</div>

<style>
  .fond-ajout-cercle{position:fixed; inset:0; z-index:1000; display:grid; place-items:center; background:rgba(0,0,0,.45); padding:16px}
  .boite{width:min(440px,100%); max-height:80vh; overflow:auto; display:flex; flex-direction:column; gap:10px; padding:16px 18px;
    border-radius:var(--v2-r-card); border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-txt); font-family:var(--v2-sans)}
  .tete{display:flex; align-items:center; gap:10px}
  .tete h3{margin:0; flex:1; font-size:15px}
  .note{font-size:11.5px; color:var(--v2-txt3); margin:0}
  .vide{margin:0}
  .choix{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px}
  .ligne{width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 10px; border-radius:var(--v2-r-md);
    border:1px solid var(--v2-line); background:var(--v2-surface2); color:var(--v2-txt); cursor:pointer; font:13px var(--v2-sans); text-align:left}
  .ligne:disabled{opacity:.5; cursor:not-allowed}
  .ligne:focus-visible,.lnk:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .nom{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .err{margin:0; font-size:12.5px; color:var(--v2-danger)}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:18px; padding:2px 6px}
</style>
