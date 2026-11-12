<script lang="ts">
  /**
   * tune-server-rust#8066 — choisir le remplaçant d'un titre indisponible, ou
   * lire le rapport de « Réparer la playlist ».
   *
   * Deux usages, une modale :
   *  - `candidats` : la liste que le serveur propose (pochette, album, durée,
   *    score) ; « Remplacer » rend le `source_id` choisi à l'appelant, qui
   *    écrit et recharge ;
   *  - `rapport` : remplacés, à choisir (chacun ouvre sa liste de candidats),
   *    sans candidat.
   *
   * La modale n'écrit rien elle-même : elle ne connaît pas la playlist.
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { formatTime } from '../../lib/utils';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { pourcent, type CandidatRemplacement, type RapportReparation } from '../../lib/remplacementIndisponibles';

  interface Props {
    /** Le titre à remplacer (mode candidats). */
    titreDisparu?: string;
    candidats?: CandidatRemplacement[] | null;
    rapport?: RapportReparation | null;
    /** Rend la promesse de l'écriture ; la modale attend avant de se fermer. */
    choisir?: (c: CandidatRemplacement) => Promise<unknown>;
    /** Mode rapport : ouvrir le choix d'une ligne « à choisir ». */
    choisirPour?: (ligne: RapportReparation['to_choose'][number]) => void;
    onClose: () => void;
  }
  let { titreDisparu = '', candidats = null, rapport = null, choisir, choisirPour, onClose }: Props = $props();

  let enCours = $state<string | null>(null);

  async function prendre(c: CandidatRemplacement) {
    if (!choisir || enCours) return;
    enCours = c.source_id;
    try {
      await choisir(c);
    } finally {
      enCours = null;
    }
  }

  const titre = $derived(
    rapport
      ? $t('v2.pl.repairReport' as any)
      : $t('v2.pl.replaceTitle' as any).replace('{title}', titreDisparu),
  );

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <!-- Le clic est arrêté pour que le fond ne ferme pas la modale ; Échap la
       ferme au clavier (`svelte:window`). -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="panneau" role="dialog" aria-modal="true" aria-label={titre} tabindex="-1"
    data-remplacer-indisponible onclick={(e) => e.stopPropagation()}>
    <h2>{titre}</h2>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>

    {#if candidats}
      <p class="aide">{$t('v2.pl.replaceChoose' as any)}</p>
      <ul class="liste">
        {#each candidats as c (c.source_id)}
          <li class="cand" data-candidat={c.source_id}>
            <span class="vig"><AlbumArt coverPath={c.cover_path ?? undefined} size={44} vignette alt={c.title} source={c.source} /></span>
            <span class="txt">
              <span class="t" title={c.title}>{c.title}</span>
              <span class="s" title={`${c.artist_name ?? ''}${c.album_title ? ` — ${c.album_title}` : ''}`}>{c.artist_name ?? ''}{c.album_title ? ` — ${c.album_title}` : ''}</span>
            </span>
            <span class="duree">{c.duration_ms ? formatTime(c.duration_ms) : ''}</span>
            <span class="score" class:sur={c.sure} title={$t('v2.pl.replaceScore' as any).replace('{score}', String(pourcent(c.score)))}>
              {pourcent(c.score)} %{#if c.sure}<span class="badge">{$t('v2.pl.replaceSure' as any)}</span>{/if}
            </span>
            <button class="pri" onclick={() => void prendre(c)} disabled={enCours != null}>
              {$t('v2.pl.replaceAction' as any)}
            </button>
          </li>
        {/each}
      </ul>
    {:else if rapport}
      {#if !rapport.examined}
        <p class="aide">{$t('v2.pl.repairNothing' as any)}</p>
      {/if}
      {#if rapport.replaced.length}
        <h3>{$t('v2.pl.repairReplaced' as any).replace('{n}', String(rapport.replaced.length))}</h3>
        <ul class="liste" data-rapport="replaced">
          {#each rapport.replaced as l, i (i)}
            <li class="ligne"><span class="t" title={l.title}>{l.title}</span><span class="s" title={l.artist_name ?? ''}>{l.artist_name ?? ''}</span><span class="score sur">{pourcent(l.score)} %</span></li>
          {/each}
        </ul>
      {/if}
      {#if rapport.to_choose.length}
        <h3>{$t('v2.pl.repairToChoose' as any).replace('{n}', String(rapport.to_choose.length))}</h3>
        <ul class="liste" data-rapport="to_choose">
          {#each rapport.to_choose as l, i (i)}
            <li class="ligne"><span class="t" title={l.title}>{l.title}</span><span class="s" title={l.artist_name ?? ''}>{l.artist_name ?? ''}</span>
              <button class="sec" onclick={() => choisirPour?.(l)}>{$t('v2.pl.repairChoose' as any)}</button></li>
          {/each}
        </ul>
      {/if}
      {#if rapport.no_candidate.length}
        <h3>{$t('v2.pl.repairNoCandidate' as any).replace('{n}', String(rapport.no_candidate.length))}</h3>
        <ul class="liste" data-rapport="no_candidate">
          {#each rapport.no_candidate as l, i (i)}
            <li class="ligne"><span class="t" title={l.title}>{l.title}</span><span class="s" title={l.artist_name ?? ''}>{l.artist_name ?? ''}</span></li>
          {/each}
        </ul>
      {/if}
      {#if rapport.errors.length}
        <h3>{$t('v2.pl.repairErrors' as any).replace('{n}', String(rapport.errors.length))}</h3>
        <ul class="liste">
          {#each rapport.errors as l, i (i)}
            <li class="ligne"><span class="t" title={l.title}>{l.title}</span></li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</div>

<style>
  .fond {
    position: fixed; inset: 0; z-index: 900; display: grid; place-items: center;
    background: rgba(0, 0, 0, 0.55); padding: 20px;
  }
  .panneau {
    position: relative; width: min(620px, 100%); max-height: 85vh; overflow: auto;
    background: var(--v2-surface); color: var(--v2-txt); border: 1px solid var(--v2-line2);
    border-radius: var(--v2-r-card); padding: 20px 22px 22px; font-family: var(--v2-sans);
  }
  h2 { font-size: calc(17px * var(--v2-txt-echelle, 1)); font-weight: 700; margin: 0 32px 12px 0; }
  h3 { font: 600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--v2-txt3); margin: 16px 0 6px; }
  .aide { color: var(--v2-txt2); font-size: calc(13px * var(--v2-txt-echelle, 1)); margin: 0 0 10px; }
  .fermer {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border: 0; border-radius: 8px;
    background: transparent; color: var(--v2-txt3); font-size: calc(20px * var(--v2-txt-echelle, 1)); line-height: 1; cursor: pointer;
  }
  .fermer:hover { background: var(--v2-surface2); color: var(--v2-txt); }
  .liste { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .cand, .ligne {
    display: grid; align-items: center; gap: 10px; padding: 6px 8px;
    border: 1px solid var(--v2-line2); border-radius: 8px;
  }
  .cand { grid-template-columns: 44px minmax(0, 1fr) auto auto auto; }
  .ligne { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
  .vig { width: 44px; height: 44px; }
  .txt { display: grid; min-width: 0; }
  .t { font-weight: 600; font-size: calc(13.5px * var(--v2-txt-echelle, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .s { color: var(--v2-txt3); font-size: calc(12px * var(--v2-txt-echelle, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .duree { font: calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color: var(--v2-txt2); }
  .score { font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color: var(--v2-txt2); white-space: nowrap; }
  .score.sur { color: var(--v2-acc1); }
  .badge { margin-left: 6px; font-size: calc(10px * var(--v2-txt-echelle, 1)); text-transform: uppercase; }
  button.pri, button.sec { border-radius: 8px; font: 600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding: 6px 12px; cursor: pointer; }
  .pri { border: 0; background: var(--v2-acc1); color: var(--v2-on-acc); }
  .pri:disabled { opacity: .5; cursor: default; }
  .sec { border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt2); }
  @media (max-width: 560px) {
    .cand { grid-template-columns: 44px minmax(0, 1fr) auto; }
    .duree { display: none; }
    .cand .pri { grid-column: 1 / -1; }
  }
</style>
