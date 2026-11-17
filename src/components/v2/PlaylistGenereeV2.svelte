<script lang="ts">
  /**
   * La liste d'une playlist GÉNÉRÉE — « Parce que vous aimez <artiste> »
   * (renesenses/tune-web-client#3118).
   *
   * Elle n'existe que dans la réponse de `/home/because-you-like` : aucune
   * playlist Tune derrière, donc pas de fiche à rouvrir. Cette surcouche montre
   * ses titres et offre les deux gestes de la demande : « Lire » et
   * « Enregistrer comme playlist » (le nom se corrige avant d'enregistrer).
   *
   * Déplacée à la racine du document (`portail`), comme les autres modales :
   * ouverte depuis une vignette, une surcouche `fixed` resterait enfermée.
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { notifications } from '../../lib/stores/notifications';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { currentZoneId } from '../../lib/stores/zones';
  import { formatTime } from '../../lib/utils';
  import MosaiqueDifferee from './MosaiqueDifferee.svelte';
  import {
    enregistrerPlaylistGeneree,
    lirePlaylistGeneree,
    type PlaylistGeneree,
  } from '../../lib/parceQueVousAimez';

  interface Props {
    playlist: PlaylistGeneree;
    onClose: () => void;
  }
  let { playlist, onClose }: Props = $props();

  const titre = $derived(($t('v2.home.becauseYouLikeCard' as any) as string).replace('{artiste}', playlist.artist));
  let nom = $state('');
  let nomTouche = $state(false);
  $effect(() => {
    if (!nomTouche) nom = titre;
  });
  let travail = $state(false);
  let enregistree = $state(false);

  function lire() {
    const z = $currentZoneId;
    if (z == null) {
      notifications.error($t('v2.home.becauseYouLikeNoZone' as any));
      return;
    }
    lirePlaylistGeneree(z, playlist).then(onClose, signalerEchecLecture);
  }

  async function enregistrer(e: Event) {
    e.preventDefault();
    const n = nom.trim();
    if (!n || travail) return;
    travail = true;
    try {
      await enregistrerPlaylistGeneree(playlist, n);
      enregistree = true;
      notifications.success(($t('v2.home.becauseYouLikeSaved' as any) as string).replace('{nom}', n));
    } catch (err: any) {
      notifierErreur($t('common.error' as any), err, { motifSeul: true });
    }
    travail = false;
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={titre} onclick={(e) => e.stopPropagation()}>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>
    <header>
      <div class="vignette">
        <MosaiqueDifferee pochettes={playlist.covers ?? []} initiales={playlist.artist.slice(0, 1)} alt={titre} />
      </div>
      <div class="infos">
        <h2>{titre}</h2>
        <p class="sous">
          {($t('v2.home.becauseYouLikeCount' as any) as string)
            .replace('{n}', String(playlist.tracks.length))
            .replace('{duree}', formatTime(playlist.duration_ms ?? 0))}
          {#if playlist.refresh_days}
            · {($t('v2.home.becauseYouLikeRefresh' as any) as string).replace('{n}', String(playlist.refresh_days))}
          {/if}
        </p>
        <div class="gestes">
          <button type="button" class="pri" onclick={lire} data-testid="pvaa-lire">{$t('v2.home.becauseYouLikePlay' as any)}</button>
        </div>
      </div>
    </header>

    <ol class="titres">
      {#each playlist.tracks as tr, i (i)}
        <li>
          <span class="rang">{i + 1}</span>
          <span class="txt">
            <span class="t" title={tr.title}>{tr.title}</span>
            <span class="a" title={tr.artist_name ?? ''}>{tr.artist_name ?? ''}{#if tr.album_title} · {tr.album_title}{/if}</span>
          </span>
          {#if tr.source && tr.source !== 'local'}<span class="src">{tr.source}</span>{/if}
          <span class="d">{formatTime(tr.duration_ms ?? 0)}</span>
        </li>
      {/each}
    </ol>

    <form class="pied" onsubmit={enregistrer}>
      <label>
        <span>{$t('v2.home.becauseYouLikeName' as any)}</span>
        <input bind:value={nom} oninput={() => (nomTouche = true)} required />
      </label>
      <button type="submit" class="sec" disabled={travail || enregistree || !nom.trim()} data-testid="pvaa-enregistrer">
        {enregistree ? $t('v2.home.becauseYouLikeDone' as any) : $t('v2.home.becauseYouLikeSave' as any)}
      </button>
    </form>
  </div>
</div>

<style>
  .fond {
    position: fixed; inset: 0; z-index: 900;
    display: grid; place-items: center;
    background: rgba(0, 0, 0, 0.55); padding: 20px;
  }
  .panneau {
    position: relative; display: flex; flex-direction: column;
    width: min(620px, 100%); max-height: min(86vh, 900px);
    background: var(--v2-surface); color: var(--v2-txt);
    border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card);
    padding: 20px 22px 18px; font-family: var(--v2-sans);
  }
  .fermer {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
    border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3);
    font-size: calc(20px * var(--v2-txt-echelle, 1)); line-height: 1; cursor: pointer;
  }
  .fermer:hover { background: var(--v2-surface2); color: var(--v2-txt); }
  header { display: flex; gap: 16px; align-items: flex-end; margin-bottom: 14px; padding-right: 28px; }
  .vignette { width: 112px; height: 112px; flex: none; border-radius: 10px; overflow: hidden; }
  .infos { min-width: 0; }
  h2 { font-size: calc(18px * var(--v2-txt-echelle, 1)); font-weight: 700; margin: 0 0 4px; }
  .sous { margin: 0 0 10px; color: var(--v2-txt3); font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); }
  .gestes { display: flex; gap: 8px; }
  button.pri, button.sec {
    border-radius: 8px; font: 600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding: 8px 14px; cursor: pointer;
  }
  .pri { border: 0; background: var(--v2-acc1); color: var(--v2-on-acc); }
  .sec { border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt2); }
  .sec:hover:not(:disabled) { color: var(--v2-txt); }
  button:disabled { opacity: .5; cursor: default; }
  .titres {
    list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1 1 auto; min-height: 0;
    border-top: 1px solid var(--v2-line2); border-bottom: 1px solid var(--v2-line2);
  }
  .titres li {
    display: flex; align-items: center; gap: 10px; padding: 7px 4px;
    border-bottom: 1px solid var(--v2-line, var(--v2-line2));
  }
  .titres li:last-child { border-bottom: 0; }
  .rang { width: 22px; flex: none; text-align: right; color: var(--v2-txt3); font: 500 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); }
  .txt { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
  .t, .a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t { font-size: calc(13.5px * var(--v2-txt-echelle, 1)); }
  .a { font-size: calc(12px * var(--v2-txt-echelle, 1)); color: var(--v2-txt3); }
  .src {
    flex: none; padding: 1px 6px; border-radius: 6px; border: 1px solid var(--v2-line2);
    color: var(--v2-txt3); font: 600 calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); text-transform: uppercase;
  }
  .d { flex: none; color: var(--v2-txt3); font: 500 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); }
  .pied { display: flex; gap: 10px; align-items: flex-end; margin-top: 14px; }
  .pied label { flex: 1 1 auto; min-width: 0; }
  .pied label span {
    display: block; margin-bottom: 5px;
    font: 600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing: .06em; text-transform: uppercase;
    color: var(--v2-txt3);
  }
  input {
    width: 100%; box-sizing: border-box;
    background: var(--v2-bg); border: 1px solid var(--v2-line2); border-radius: 8px;
    color: var(--v2-txt); font: inherit; font-size: calc(13.5px * var(--v2-txt-echelle, 1)); padding: 8px 10px;
  }
  input:focus { outline: 2px solid var(--v2-acc1); outline-offset: -1px; }
  @media (max-width: 600px) {
    .fond { padding: 0; place-items: stretch; }
    .panneau { width: 100%; max-height: none; height: 100%; border-radius: 0; padding: 16px 16px 14px; }
    .vignette { width: 84px; height: 84px; }
    .pied { flex-direction: column; align-items: stretch; }
  }
</style>
