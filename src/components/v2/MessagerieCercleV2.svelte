<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { motifCercle } from '../../lib/circle';
  import { relireNotifications } from '../../lib/circleNotifications';
  import { messagerieSupport, conversations, ouvrirConversation, lireMessages, envoyerMessage, effacerMessage, signalerMessages, marquerConversationLue, demandeConversation, chercherCarte, garderCarte, longueurMessage, messageEnvoyable, MESSAGE_MAX, RELECTURE_MESSAGES_MS, type ConversationCercle, type MessageCercle } from '../../lib/circleMessagerie';

  let disponible = $state(false);
  let liste = $state<ConversationCercle[]>([]);
  let choix = $state<ConversationCercle | null>(null);
  let messages = $state<MessageCercle[]>([]);
  let cursor = $state<string | null>(null);
  let texte = $state('');
  let occupe = $state(false);
  let erreur = $state('');
  let selection = $state<number[]>([]);
  let signalement = $state(false);
  let raison = $state('harassment');
  let commentaire = $state('');
  let fini = false;
  let dernierTour = 0;
  const tr = (k: string) => $t(k as any);
  const chronologiques = $derived([...messages].sort((a, b) => a.id - b.id));
  const total = $derived(liste.reduce((n, c) => n + c.unread_count, 0));

  function echec(e: unknown) {
    if ((e as any)?.status === 404 || (e as any)?.status === 412) { choix = null; messages = []; selection = []; }
    erreur = (e as any)?.code === 'circle.card_not_found' ? tr('v2.circle.msg.notFound') : tr(motifCercle(e).cle);
  }
  async function page(id: number, avant?: string) {
    const p = await lireMessages(id, avant);
    if (fini || choix?.id !== id) return;
    choix = p.conversation;
    messages = avant ? [...new Map([...messages, ...p.messages].map((m) => [m.id, m])).values()] : p.messages;
    cursor = p.next_cursor;
    // Ne marquer que la page réellement affichée, sans absorber un message
    // qui arriverait entre le GET et le POST.
    const dernier = Math.max(0, ...p.messages.map((m) => m.id));
    if (dernier) await marquerConversationLue(id, dernier);
    if (fini || choix?.id !== id) return;
    liste = liste.map((c) => c.id === id ? { ...c, unread_count: 0 } : c);
    await relireNotifications();
  }
  async function charger() {
    dernierTour = Date.now();
    try {
      const l = await conversations();
      if (fini) return;
      liste = l; disponible = true;
      if (choix) {
        if (!l.some((c) => c.id === choix?.id)) { choix = null; messages = []; selection = []; }
        else await page(choix.id);
      }
    } catch (e) {
      if ((e as any)?.status === 404) { disponible = false; messagerieSupport.set(false); choix = null; messages = []; liste = []; }
      else echec(e);
    }
  }
  async function geste(faire: () => Promise<unknown>) {
    if (occupe) return;
    occupe = true; erreur = '';
    try { await faire(); } catch (e) { if (!fini) echec(e); } finally { if (!fini) occupe = false; }
  }
  async function ouvrir(c: ConversationCercle) {
    choix = c; messages = []; selection = []; signalement = false; cursor = null;
    await page(c.id);
  }
  $effect(() => {
    const d = $demandeConversation;
    if (!d) return;
    demandeConversation.set(null);
    void geste(async () => {
      if (d.contact) {
        const c = await ouvrirConversation(d.contact); disponible = true;
        if (!liste.some((l) => l.id === c.id)) liste = [c, ...liste];
        await ouvrir(c);
      } else if (d.conversation) {
        const l = await conversations(); if (fini) return;
        liste = l; disponible = true;
        const c = l.find((c) => c.id === d.conversation); if (c) await ouvrir(c);
      }
    });
  });
  async function envoyer(ev: SubmitEvent) {
    ev.preventDefault();
    if (!choix || !messageEnvoyable(texte, null)) return;
    const id = choix.id; const brouillon = texte;
    await geste(async () => { await envoyerMessage(id, brouillon); if (choix?.id === id) texte = ''; await charger(); });
  }
  async function supprimer(m: MessageCercle) {
    if (!choix || !m.mine || !(await dialogs.confirm(tr('v2.circle.msg.deleteConfirm'), { danger: true }))) return;
    const id = choix.id;
    await geste(async () => { await effacerMessage(id, m.id); messages = messages.filter((v) => v.id !== m.id); await charger(); });
  }
  function cocher(id: number, checked: boolean) {
    selection = checked ? [...new Set([...selection, id])].slice(0, 20) : selection.filter((m) => m !== id);
  }
  async function signaler(ev: SubmitEvent) {
    ev.preventDefault(); if (!choix || !selection.length) return;
    const id = choix.id;
    await geste(async () => { await signalerMessages(id, selection, raison, commentaire); signalement = false; selection = []; commentaire = ''; });
  }
  onMount(() => {
    void charger();
    const tour = () => { if (!document.hidden && !occupe && Date.now() - dernierTour >= RELECTURE_MESSAGES_MS) void charger(); };
    const timer = setInterval(tour, RELECTURE_MESSAGES_MS);
    document.addEventListener('visibilitychange', tour);
    return () => { fini = true; clearInterval(timer); document.removeEventListener('visibilitychange', tour); };
  });
</script>

{#if disponible}
  <section class="messagerie" id="circle-messages" aria-labelledby="messages-titre">
    <h2 id="messages-titre">{tr('v2.circle.msg.title')} {#if total}<span class="pastille">{total}</span>{/if}</h2>
    <p class="note">{tr('v2.circle.msg.privacy')}</p>
    {#if erreur}<p role="alert" class="erreur">{erreur}</p>{/if}
    <div class="volets">
      <nav aria-label={tr('v2.circle.msg.title')}>
        {#if !liste.length}<p class="note">{tr('v2.circle.msg.empty')}</p>{/if}
        {#each liste as c (c.id)}
          <button type="button" class="conversation" class:choisie={choix?.id === c.id} disabled={occupe} onclick={() => void geste(() => ouvrir(c))}>
            <strong>{c.contact.name}</strong>{#if c.unread_count}<span class="pastille">{c.unread_count}</span>{/if}
            <span class="extrait">{c.last_message?.body ?? c.last_message?.card?.title ?? ''}</span>
          </button>
        {/each}
      </nav>
      {#if choix}
        <div class="fil">
          <h3>{choix.contact.name}</h3>
          {#if cursor}<button type="button" disabled={occupe} onclick={() => void geste(() => page(choix!.id, cursor!))}>{tr('v2.circle.msg.older')}</button>{/if}
          <ol class="messages" aria-label={choix.contact.name}>
            {#each chronologiques as m (m.id)}
              <li class:mon-message={m.mine}>
                <div class="auteur">{m.mine ? tr('v2.circle.msg.me') : choix.contact.name}</div>
                {#if m.body}<p class="texte">{m.body}</p>{/if}
                {#if m.card}
                  <article class="carte">
                    {#if m.card.cover_url}<img src={m.card.cover_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
                    <div><strong>{m.card.title}</strong>{#if m.card.artist_name}<p>{m.card.artist_name}</p>{/if}</div>
                    <div class="gestes">
                      <button type="button" onclick={() => chercherCarte(m.card!)}>{tr('v2.circle.msg.playHere')}</button>
                      <button type="button" disabled={occupe} onclick={() => void geste(() => garderCarte(m.card!))}>{tr('v2.later.add')}</button>
                    </div>
                  </article>
                {/if}
                <div class="gestes">
                  {#if m.mine}<button type="button" disabled={occupe} onclick={() => void supprimer(m)}>{tr('common.delete')}</button>
                  {:else}<label><input type="checkbox" checked={selection.includes(m.id)} disabled={!selection.includes(m.id) && selection.length >= 20} onchange={(ev) => cocher(m.id, ev.currentTarget.checked)} />{tr('v2.circle.msg.select')}</label>{/if}
                </div>
              </li>
            {/each}
          </ol>
          <form onsubmit={envoyer}>
            <label for="message-texte">{tr('v2.circle.msg.write')}</label>
            <textarea id="message-texte" bind:value={texte} rows="3" maxlength="8000" disabled={occupe}></textarea>
            <span class="note">{longueurMessage(texte)} / {MESSAGE_MAX}</span>
            <button type="submit" disabled={occupe || !messageEnvoyable(texte, null)}>{tr('v2.circle.msg.send')}</button>
          </form>
          {#if selection.length}<button type="button" onclick={() => signalement = !signalement}>{tr('v2.circle.msg.report')} ({selection.length})</button>{/if}
          {#if signalement}
            <form onsubmit={signaler}>
              <p class="note">{tr('v2.circle.msg.reportHint')}</p>
              <label for="message-raison">{tr('v2.circle.msg.reason')}</label>
              <select id="message-raison" bind:value={raison}>
                {#each ['harassment', 'spam', 'hate', 'illegal', 'other'] as r}<option value={r}>{tr(`v2.circle.msg.${r}`)}</option>{/each}
              </select>
              <label for="message-commentaire">{tr('v2.circle.msg.comment')}</label>
              <textarea id="message-commentaire" bind:value={commentaire} maxlength="1000" rows="2"></textarea>
              <button type="submit" disabled={occupe || !selection.length}>{tr('v2.circle.msg.report')}</button>
            </form>
          {/if}
        </div>
      {/if}
    </div>
  </section>
{:else if erreur}<p role="alert">{erreur}</p>{/if}

<style>
  .messagerie{border:1px solid var(--v2-line);border-radius:12px;padding:18px;margin:18px 0;color:var(--v2-txt)}
  h2{font-size:18px;margin:0 0 8px}h3{font-size:16px;margin:0 0 12px}
  .volets{display:grid;grid-template-columns:minmax(180px,1fr) minmax(0,3fr);gap:18px}
  nav{display:flex;flex-direction:column;gap:4px}.conversation{text-align:left;width:100%;padding:10px}.choisie{border-color:var(--v2-acc1)}
  .extrait{display:block;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--v2-txt2)}
  .pastille{border-radius:12px;padding:2px 7px;background:var(--v2-acc1);color:var(--v2-bg);font-size:12px}
  .note{font-size:12px;color:var(--v2-txt2)}.erreur{color:var(--v2-danger)}
  button,select,textarea{font:inherit;color:inherit;border:1px solid var(--v2-line);background:var(--v2-bg);border-radius:6px;padding:7px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}
  .messages{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px;max-height:55vh;overflow:auto}
  li{padding:12px;border:1px solid var(--v2-line);border-radius:9px;overflow-wrap:anywhere}.mon-message{border-color:var(--v2-acc1);margin-left:20px}
  .auteur{font-size:12px;color:var(--v2-txt2)}.texte{white-space:pre-wrap;margin:6px 0}
  form{display:flex;flex-direction:column;gap:6px;margin:16px 0}textarea{resize:vertical;width:100%;box-sizing:border-box}
  .gestes{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;font-size:12px}.carte{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.carte img{width:64px;height:64px;object-fit:contain}
  @media(max-width:640px){.volets{grid-template-columns:1fr}.messages{max-height:none}nav{max-height:180px;overflow:auto}}
</style>
