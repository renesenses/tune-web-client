<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { getCercle, estConnecte, motifCercle, type ContactCercle } from '../../lib/circle';
  import { carteAPartager, ouvrirConversation, envoyerMessage, messageEnvoyable, longueurMessage, MESSAGE_MAX, type CarteMusique } from '../../lib/circleMessagerie';
  let { carte }: { carte: CarteMusique } = $props();
  let contacts = $state<ContactCercle[]>([]);
  let destinataire = $state<number | ''>('');
  let texte = $state('');
  let occupe = $state(false);
  let erreur = $state('');
  const tr = (k: string) => $t(k as any);
  onMount(() => { void getCercle().then((e) => { contacts = estConnecte(e) ? e.members : []; }).catch((e) => erreur = tr(motifCercle(e).cle)); });
  async function envoyer(ev: SubmitEvent) {
    ev.preventDefault(); if (!destinataire || occupe) return;
    occupe = true; erreur = '';
    try { const c = await ouvrirConversation(Number(destinataire)); await envoyerMessage(c.id, texte, carte); carteAPartager.set(null); }
    catch (e) { erreur = tr(motifCercle(e).cle); }
    finally { occupe = false; }
  }
</script>

<div class="fond">
  <section class="partage" role="dialog" aria-modal="true" aria-labelledby="partage-message-titre" tabindex="-1">
    <h2 id="partage-message-titre">{tr('v2.circle.msg.share')}</h2>
    <p><strong>{carte.title}</strong>{#if carte.artist_name} · {carte.artist_name}{/if}</p>
    <p class="note">{tr('v2.circle.msg.privacy')}</p>
    {#if erreur}<p role="alert">{erreur}</p>{/if}
    {#if !contacts.length}<p>{tr('v2.circle.msg.empty')}</p>{/if}
    <form onsubmit={envoyer}>
      <label for="message-contact">{tr('v2.circle.msg.recipient')}</label>
      <select id="message-contact" bind:value={destinataire} disabled={occupe}>
        <option value="">—</option>
        {#each contacts as c (c.user_id)}<option value={c.user_id}>{c.name}</option>{/each}
      </select>
      <label for="message-partage-texte">{tr('v2.circle.msg.write')}</label>
      <textarea id="message-partage-texte" bind:value={texte} rows="3" maxlength="8000" disabled={occupe}></textarea>
      <span class="note">{longueurMessage(texte)} / {MESSAGE_MAX}</span>
      <div class="boutons">
        <button type="button" disabled={occupe} onclick={() => carteAPartager.set(null)}>{tr('common.cancel')}</button>
        <button type="submit" disabled={occupe || !destinataire || !messageEnvoyable(texte, carte)}>{tr('v2.circle.msg.send')}</button>
      </div>
    </form>
  </section>
</div>

<style>
  .fond{position:fixed;inset:0;background:rgb(0 0 0 / 65%);display:grid;place-items:center;z-index:2000;padding:18px}
  .partage{width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--v2-bg);color:var(--v2-txt);padding:24px;border:1px solid var(--v2-line);border-radius:12px;box-sizing:border-box}
  h2{font-size:20px;margin-top:0}.note{font-size:12px;color:var(--v2-txt2)}form{display:flex;flex-direction:column;gap:8px}.boutons{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  button,textarea,select{font:inherit;border:1px solid var(--v2-line);background:var(--v2-bg);color:inherit;border-radius:6px;padding:8px}button{cursor:pointer}button:disabled{opacity:.5}textarea{resize:vertical}
</style>
