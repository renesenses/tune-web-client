<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { copyText } from '../../lib/utils';
  import { notifications } from '../../lib/stores/notifications';
  import { carteAPartager, carteDepuisPiste } from '../../lib/circleMessagerie';
  import { partagePublic } from '../../lib/partagePublic';
  let { piste }: { piste: any } = $props();
  const partage = $derived(partagePublic(piste));
  const carte = $derived(carteDepuisPiste(piste));
  let repli = $state('');
  let champ = $state<HTMLTextAreaElement>();
  let menu = $state<HTMLDetailsElement>();
  async function montrerRepli(value: string) { repli = value; await tick(); champ?.focus(); champ?.select(); }
  async function copier() {
    const value = partage.texte;
    let ok = false;
    try { ok = await copyText(value); } catch { /* Manual selection remains available. */ }
    if (ok) { repli = ''; notifications.success($t('nowplaying.publicShare.copied')); if (menu) menu.open = false; }
    else await montrerRepli(value);
  }
  async function natif() {
    const value = partage;
    try { await navigator.share(value.url ? { url: value.url } : { text: value.texte }); }
    catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) await montrerRepli(value.texte); }
  }
  function message() { if (carte) { carteAPartager.set(carte); if (menu) menu.open = false; } }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && menu?.open) { menu.open = false; menu.querySelector('summary')?.focus(); } }} />
<details bind:this={menu} class="partage-ecoute">
  <summary aria-label={$t('nowplaying.share')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 11 6-4M9 14l6 4"/></svg>{$t('nowplaying.share')}</summary>
  <div class="choix">
    <button type="button" disabled={!partage.texte} onclick={copier}>{$t('nowplaying.publicShare.copy')}</button>
    <button type="button" disabled={!carte} onclick={message}>{$t('v2.circle.msg.share')}</button>
    {#if typeof navigator !== 'undefined' && typeof navigator.share === 'function'}
      <button type="button" disabled={!partage.texte} onclick={natif}>{$t('nowplaying.publicShare.native')}</button>
    {/if}
    {#if repli}<label>{$t('nowplaying.publicShare.manual')}<textarea bind:this={champ} readonly value={repli} rows="3"></textarea></label>{/if}
  </div>
</details>
<style>
  .partage-ecoute{position:relative;font:inherit;color:inherit}
  summary{display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 10px;border:1px solid var(--v2-line,var(--tune-border));border-radius:6px;font-size:12px;list-style:none}
  .choix{position:absolute;z-index:100;bottom:100%;left:0;width:min(300px,80vw);padding:8px;display:grid;gap:6px;background:var(--v2-bg,var(--tune-bg));border:1px solid var(--v2-line,var(--tune-border));border-radius:8px;color:var(--v2-txt,var(--tune-text))}
  button,textarea{font:inherit;color:inherit;background:transparent;border:1px solid var(--v2-line,var(--tune-border));border-radius:4px;padding:8px;text-align:left}button{cursor:pointer}button:disabled{opacity:.5}textarea{width:100%;box-sizing:border-box;resize:vertical}label{font-size:12px}summary:focus-visible,button:focus-visible,textarea:focus-visible{outline:2px solid var(--v2-acc2,#cb8c32);outline-offset:2px}
</style>
