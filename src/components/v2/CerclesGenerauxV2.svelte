<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { motifCercle } from '../../lib/circle';
  import { cerclesGeneraux, rejoindreCercleGeneral, quitterCercleGeneral, demandeConversation, type CercleGeneral } from '../../lib/circleMessagerie';
  let liste = $state<CercleGeneral[]>([]);
  let erreur = $state('');
  let occupe = $state(false);
  let fini = false;
  const tr = (k: string) => $t(k as any);
  async function charger() {
    try { const l = await cerclesGeneraux(); if (!fini) liste = l; }
    catch (e) { if (!fini && (e as any)?.status !== 404) erreur = tr(motifCercle(e).cle); }
  }
  async function adhesion(c: CercleGeneral) {
    if (occupe) return;
    if (c.joined && !(await dialogs.confirm(tr('v2.circle.msg.leaveConfirm')))) return;
    occupe = true; erreur = '';
    try {
      if (c.joined) { await quitterCercleGeneral(c.id); window.dispatchEvent(new CustomEvent('circle-membership-changed', { detail: { circleId: c.id } })); }
      else await rejoindreCercleGeneral(c.id);
      await charger();
    } catch (e) { if (!fini) erreur = tr(motifCercle(e).cle); }
    finally { if (!fini) occupe = false; }
  }
  async function ecrire(id: number) { demandeConversation.set({ circle: id }); await tick(); document.getElementById('circle-messages')?.scrollIntoView?.({ block: 'start' }); }
  onMount(() => { void charger(); return () => { fini = true; }; });
</script>

{#if liste.length || erreur}
  <section class="cercles-generaux" aria-labelledby="cercles-generaux-titre">
    <h2 id="cercles-generaux-titre">{tr('v2.circle.msg.generalTitle')}</h2>
    {#if erreur}<p role="alert">{erreur}</p>{/if}
    <ul>{#each liste as c (c.id)}<li>
      <div><strong>{c.name}</strong><span>{c.member_count} {tr('v2.circle.msg.members')}</span></div>
      <button type="button" disabled={occupe} onclick={() => void adhesion(c)}>{tr(c.joined ? 'v2.circle.msg.leave' : 'v2.circle.msg.join')}</button>
      {#if c.joined}<button type="button" disabled={occupe} onclick={() => void ecrire(c.id)}>{tr('v2.circle.msg.writeCircle')}</button>{/if}
    </li>{/each}</ul>
  </section>
{/if}

<style>
  .cercles-generaux{margin:24px 0;color:var(--v2-txt)}h2{font-size:18px}ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:8px}li{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px;border-bottom:1px solid var(--v2-line)}li div{flex:1;min-width:140px}span{display:block;font-size:12px;color:var(--v2-txt2);margin-top:4px}button{font:inherit;background:var(--v2-surface2);color:var(--v2-txt);border:1px solid var(--v2-line);border-radius:8px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.5}button:focus-visible{outline:2px solid var(--v2-acc1);outline-offset:3px}
</style>
