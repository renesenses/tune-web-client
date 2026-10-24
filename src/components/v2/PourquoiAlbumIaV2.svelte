<script lang="ts">
  /**
   * « Pourquoi cet album est là » (tune-server-rust #6839) : l'assistant
   * explique en clair quelles règles de la collection intelligente retiennent
   * CET album. Seules les règles et les champs de l'album partent.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import * as api from '../../lib/api';
  import { estEchec, messageDEchec, valeurLisible, type RegleIa } from '../../lib/assistantIa';
  import { pourquoiAlbumIa } from '../../lib/assistantIaRc8';

  interface Props { collectionId: number; albumId: number; titre: string; onClose: () => void }
  let { collectionId, albumId, titre, onClose }: Props = $props();

  let regles = $state<RegleIa[]>([]);
  let explication = $state<string | null>(null);
  let citees = $state<number[]>([]);
  let erreur = $state<string | null>(null);
  let occupe = $state(true);

  onMount(async () => {
    try {
      const c = await api.getSmartCollection(collectionId);
      const r = typeof c?.rules === 'string' ? JSON.parse(c.rules) : c?.rules;
      regles = Array.isArray(r) ? r : [];
      const v = await pourquoiAlbumIa({ rules: regles, match_mode: c?.match_mode ?? 'all', album_id: albumId, langue: $locale });
      if (estEchec(v)) erreur = messageDEchec(v, (k) => $t(k as any));
      else { explication = v.explication; citees = v.regles; }
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('assistantIa.coll.whyTitle' as any)}
    onclick={(e) => e.stopPropagation()} data-pourquoi-album-ia>
    <h2>{$t('assistantIa.coll.whyTitle' as any)}</h2>
    <button class="fermer" aria-label={$t('assistantIa.close' as any)} onclick={onClose}>×</button>
    <p class="note">{titre}</p>
    {#if occupe}<p class="note">{$t('assistantIa.playlist.thinking' as any)}</p>{/if}
    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    {#if explication}
      <p class="bandeau">{$t('assistantIa.coll.byAi' as any)}</p>
      <p>{explication}</p>
      <ul>
        {#each citees as i (i)}
          {#if regles[i]}<li><code>{regles[i].field}</code> {regles[i].op} <b>{valeurLisible(regles[i].value)}</b></li>{/if}
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .fond { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; background: rgba(0, 0, 0, 0.55); padding: 20px; }
  .panneau { position: relative; width: min(520px, 100%); max-height: 90vh; overflow: auto; background: var(--v2-surface); color: var(--v2-txt); border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card); padding: 20px 22px 22px; font-family: var(--v2-sans); }
  h2 { font-size: 16px; font-weight: 700; margin: 0 0 8px; }
  .fermer { position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3); font-size: 20px; cursor: pointer; }
  ul { list-style: none; padding: 0; margin: 6px 0 0; font-size: 13px; }
  .bandeau { font-size: 12px; color: var(--v2-acc1); margin: 8px 0 2px; }
  .note { font-size: 12.5px; color: var(--v2-txt3); margin: 4px 0; }
  .err { font-size: 12.5px; color: var(--v2-danger); }
</style>
