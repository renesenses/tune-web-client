<script lang="ts">
  /**
   * web#2806 — « Ajouter une radio » depuis l'éditeur d'une playlist Tune.
   *
   * Choisit une station de « Mes radios » (`GET /radios`) et l'ajoute en fin
   * de playlist par `radio_ids` (tune-server-rust#8412). Une station de
   * l'annuaire doit d'abord rejoindre « Mes radios » : seules celles-là sont
   * proposées. Le serveur dédoublonne ; un 404 `playlist_radio_not_found` se
   * dit comme tout échec.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { filtrerParNom } from '../../lib/filtrePlaylists';
  import { notifications } from '../../lib/stores/notifications';
  import type { RadioStation } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';

  let { playlistId, onClose, onAjoutee }: {
    playlistId: number;
    onClose: () => void;
    /** La station est dans la playlist : l'écran relit ses lignes. */
    onAjoutee: () => void;
  } = $props();

  let radios = $state<RadioStation[]>([]);
  let chargement = $state(true);
  let requete = $state('');
  let enCours = $state<number | null>(null);
  let echec = $state(false);

  const vues = $derived(filtrerParNom(radios.filter((r) => r.id != null), requete, (r) => r.name));

  $effect(() => {
    let vivant = true;
    api.getRadios({ limit: 500 })
      .then((l) => { if (vivant) radios = l ?? []; })
      .catch(() => { if (vivant) radios = []; })
      .finally(() => { if (vivant) chargement = false; });
    return () => { vivant = false; };
  });

  async function choisir(r: RadioStation) {
    if (r.id == null || enCours !== null) return;
    enCours = r.id;
    echec = false;
    // Résolue AVANT l'attente : un `$t()` après un `await` n'est pas suivi.
    const ok = $t('v2.pl.radioAdded' as any).replace('{name}', r.name);
    try {
      await api.addPlaylistRadios(playlistId, [r.id]);
      notifications.success(ok);
      onAjoutee();
      onClose();
    } catch {
      echec = true;
    } finally {
      enCours = null;
    }
  }

  function focusChamp(el: HTMLInputElement) {
    queueMicrotask(() => el.focus());
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('v2.pl.addRadio' as any)} tabindex="-1"
    data-choix-radio onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="tete">
      <h3>{$t('v2.pl.addRadio' as any)}</h3>
      <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>
    </div>
    <input class="champ" type="search" bind:value={requete} use:focusChamp
      placeholder={$t('v2.pl.addRadioSearch' as any)} aria-label={$t('v2.pl.addRadioSearch' as any)} />
    {#if chargement}
      <p class="vide">{$t('v2.radio.loading' as any)}</p>
    {:else if !radios.length}
      <p class="vide">{$t('v2.pl.addRadioEmpty' as any)}</p>
    {:else if !vues.length}
      <p class="vide">{$t('v2.radio.noMatch' as any)}</p>
    {:else}
      <ul class="liste">
        {#each vues as r (r.id)}
          <li>
            <button class="station" data-radio-id={r.id} disabled={enCours !== null} onclick={() => choisir(r)}>
              <span class="logo"><AlbumArt coverPath={r.logo_url || r.annuaire?.logo_url || null} albumId={null} size={0} alt={r.name} fallbackInitials={r.name?.slice(0, 1)} /></span>
              <span class="nom" title={r.name}>{r.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if echec}<p class="vide echec" role="alert">{$t('v2.pl.addRadioFailed' as any)}</p>{/if}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center; background:rgba(0,0,0,.55); padding:20px}
  .panneau{width:min(400px,100%); max-height:80vh; display:flex; flex-direction:column; gap:10px;
    background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-card); padding:16px 18px 18px; font-family:var(--v2-sans)}
  .panneau:focus{outline:none}
  .tete{display:flex; align-items:center; justify-content:space-between}
  .tete h3{margin:0; font-size:calc(16px * var(--v2-txt-echelle, 1))}
  .fermer{width:28px; height:28px; border:0; border-radius:8px; background:transparent; color:var(--v2-txt3);
    font-size:calc(20px * var(--v2-txt-echelle, 1)); line-height:1; cursor:pointer}
  .champ{width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:inherit}
  .liste{list-style:none; margin:0; padding:0; overflow-y:auto; display:flex; flex-direction:column; gap:2px}
  .station{display:flex; align-items:center; gap:10px; width:100%; padding:6px 8px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt); font:inherit; text-align:left; cursor:pointer}
  .station:hover:not(:disabled){background:var(--v2-surface2)}
  .station:disabled{opacity:.6; cursor:default}
  .logo{flex:none; width:32px; height:32px; border-radius:6px; overflow:hidden}
  .nom{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .vide{margin:6px 0; color:var(--v2-txt2); font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .echec{color:var(--v2-danger, #e5484d)}
</style>
