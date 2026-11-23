<script lang="ts">
  import Share2 from '@lucide/svelte/icons/share-2';
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
  <summary aria-label={$t('nowplaying.share')} data-np-action="share"><Share2 size={16} strokeWidth={1.8} aria-hidden="true" />{$t('nowplaying.share')}</summary>
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
  /* Design v3 (§10.5) : la même pilule que les autres actions de Lecture en cours. */
  summary{display:flex;align-items:center;gap:6px;cursor:pointer;min-height:36px;padding:0 14px;margin-top:var(--space-xs, 4px);border:1px solid var(--v2-line2,var(--tune-border));border-radius:var(--v2-r-pill,20px);font-family:var(--v2-police-texte,var(--v2-sans,inherit));font-weight:600;font-size:calc(12.5px * var(--v2-txt-echelle, 1));color:var(--v2-txt2,inherit);list-style:none;white-space:nowrap}
  summary::-webkit-details-marker{display:none}
  summary:hover{color:var(--v2-txt,inherit);border-color:var(--v2-acc2,var(--tune-accent))}
  details[open] > summary{color:var(--v2-txt,inherit);border-color:var(--v2-acc1,var(--tune-accent));background:color-mix(in srgb, var(--v2-acc1, #888) 12%, transparent)}
  @media (hover: none) and (pointer: coarse){ summary{min-height:44px} }
  .choix{position:absolute;z-index:100;bottom:100%;left:0;width:min(300px,80vw);padding:8px;display:grid;gap:6px;background:var(--v2-bg,var(--tune-bg));border:1px solid var(--v2-line,var(--tune-border));border-radius:8px;color:var(--v2-txt,var(--tune-text))}
  button,textarea{font:inherit;color:inherit;background:transparent;border:1px solid var(--v2-line,var(--tune-border));border-radius:4px;padding:8px;text-align:left}button{cursor:pointer}button:disabled{opacity:.5}textarea{width:100%;box-sizing:border-box;resize:vertical}label{font-size:calc(12px * var(--v2-txt-echelle, 1))}summary:focus-visible,button:focus-visible,textarea:focus-visible{outline:2px solid var(--v2-acc2,#cb8c32);outline-offset:2px}
</style>
