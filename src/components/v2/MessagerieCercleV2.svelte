<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { dialogs } from '../../lib/stores/dialogs';
  import { motifCercle } from '../../lib/circle';
  import { relireNotifications } from '../../lib/circleNotifications';
  import { messagerieSupport, conversations, ouvrirConversation, lireMessages, envoyerMessage, effacerMessage, signalerMessages, marquerConversationLue, demandeConversation, erreurOuvertureConversation, ecouterCarte, garderCarte, longueurMessage, messageEnvoyable, MESSAGE_MAX, RELECTURE_MESSAGES_MS, type ConversationCercle, type MessageCercle } from '../../lib/circleMessagerie';

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
  let defilement = $state<HTMLDivElement>();
  let saisie = $state<HTMLTextAreaElement>();
  let formulaire = $state<HTMLFormElement>();
  let menuMessage = $state<number | null>(null);
  let fini = false;
  let generation = 0;
  let dernierTour = 0;
  const tr = (k: string) => $t(k as any);
  const chronologiques = $derived([...messages].sort((a, b) => a.id - b.id));
  const total = $derived(liste.reduce((n, c) => n + c.unread_count, 0));

  function initiales(nom: string) { return nom.trim().split(/\s+/u).slice(0, 2).map((n) => Array.from(n)[0]).join('').toLocaleUpperCase($locale); }
  function dateValide(v: string) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  function jour(v: string) { const d = dateValide(v); return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : ''; }
  function dateJour(v: string) {
    const d = dateValide(v); if (!d) return '';
    const maintenant = new Date(); const hier = new Date(); hier.setDate(hier.getDate() - 1);
    if (jour(v) === jour(maintenant.toISOString())) return tr('v2.circle.msg.today');
    if (jour(v) === jour(hier.toISOString())) return tr('v2.circle.msg.yesterday');
    return d.toLocaleDateString($locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function heure(v: string, courte = false) {
    const d = dateValide(v); if (!d) return '';
    return courte && jour(v) !== jour(new Date().toISOString()) ? d.toLocaleDateString($locale, { day: 'numeric', month: 'short' }) : d.toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' });
  }
  function ajusterSaisie() { if (saisie) { saisie.style.height = 'auto'; saisie.style.height = `${Math.min(saisie.scrollHeight, 158)}px`; } }
  async function bas() { await tick(); if (defilement) defilement.scrollTop = defilement.scrollHeight; }
  function clavier(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (!occupe && messageEnvoyable(texte, null)) formulaire?.requestSubmit(); }
  }
  function retour() { generation++; choix = null; messages = []; selection = []; viderBrouillons(); }
  function viderBrouillons() { texte = ''; menuMessage = null; ajusterSaisie(); commentaire = ''; raison = 'harassment'; signalement = false; }
  function echec(e: unknown) {
    if ((e as any)?.status === 404 || (e as any)?.status === 412) { generation++; choix = null; messages = []; liste = []; selection = []; viderBrouillons(); }
    erreur = (e as any)?.code === 'circle.card_not_found' ? tr('v2.circle.msg.notFound') : tr(motifCercle(e).cle);
  }
  async function page(id: number, avant?: string, garderAnciens = false) {
    const tour = generation;
    const hauteur = defilement?.scrollHeight ?? 0; const position = defilement?.scrollTop ?? 0;
    const enBas = !defilement || hauteur - position - defilement.clientHeight < 80;
    const p = await lireMessages(id, avant);
    if (fini || tour !== generation || choix?.id !== id) return;
    choix = p.conversation;
    const garder = garderAnciens && messages.length > 0;
    const plancher = Math.min(...p.messages.map((m) => m.id));
    messages = avant ? [...new Map([...messages, ...p.messages].map((m) => [m.id, m])).values()]
      : garder && p.messages.length ? [...messages.filter((m) => m.id < plancher), ...p.messages] : p.messages;
    if (!garder || avant) cursor = p.next_cursor;
    await tick();
    if (avant && defilement) defilement.scrollTop = position + defilement.scrollHeight - hauteur;
    else if (!garderAnciens || enBas) await bas();
    // Ne marquer que la page réellement affichée, sans absorber un message
    // qui arriverait entre le GET et le POST.
    const dernier = Math.max(0, ...p.messages.map((m) => m.id));
    if (dernier) await marquerConversationLue(id, dernier);
    if (fini || tour !== generation || choix?.id !== id) return;
    liste = liste.map((c) => c.id === id ? { ...c, unread_count: 0 } : c);
    await relireNotifications();
  }
  async function charger() {
    dernierTour = Date.now();
    const tour = generation;
    try {
      const l = await conversations();
      if (fini || tour !== generation) return;
      liste = l; disponible = true;
      if (choix) {
        if (!l.some((c) => c.id === choix?.id)) { generation++; choix = null; messages = []; selection = []; viderBrouillons(); }
        else await page(choix.id, undefined, true);
      }
    } catch (e) {
      if (fini || tour !== generation) return;
      if ((e as any)?.status === 404) { generation++; disponible = false; messagerieSupport.set(false); choix = null; messages = []; liste = []; viderBrouillons(); }
      else echec(e);
    }
  }
  async function geste(faire: () => Promise<unknown>) {
    if (occupe) return;
    occupe = true; erreur = '';
    try { await faire(); } catch (e) { if (!fini) echec(e); } finally { if (!fini) occupe = false; }
  }
  async function ouvrir(c: ConversationCercle) {
    generation++; choix = c; messages = []; selection = []; viderBrouillons(); cursor = null;
    await page(c.id);
  }
  $effect(() => {
    const d = $demandeConversation;
    if (!d || occupe) return;
    demandeConversation.set(null);
    void geste(async () => {
      if (d.contact) {
        erreurOuvertureConversation.set(null);
        let c: ConversationCercle;
        try { c = await ouvrirConversation(d.contact); }
        catch (e) { erreurOuvertureConversation.set({ contact: d.contact, cle: motifCercle(e).cle }); throw e; }
        if (fini) return;
        disponible = true;
        if (!liste.some((l) => l.id === c.id)) liste = [c, ...liste];
        await ouvrir(c);
      } else if (d.conversation) {
        const l = await conversations(); if (fini) return;
        liste = l; disponible = true;
        const c = l.find((c) => c.id === d.conversation); if (c) await ouvrir(c);
      }
    }).then(async () => {
      await tick();
      if (fini || !choix) return;
      document.getElementById('circle-messages')?.scrollIntoView?.({ block: 'start' });
      (document.getElementById('message-texte') as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
    });
  });
  async function envoyer(ev: SubmitEvent) {
    ev.preventDefault();
    if (!choix || !messageEnvoyable(texte, null)) return;
    const id = choix.id; const brouillon = texte;
    await geste(async () => { await envoyerMessage(id, brouillon); if (choix?.id === id) { texte = ''; ajusterSaisie(); } await charger(); if (choix?.id === id) await bas(); });
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

<svelte:window onkeydown={(ev) => { if (ev.key === 'Escape' && menuMessage !== null) { (document.querySelector('#circle-messages .menu-bouton[aria-expanded="true"]') as HTMLButtonElement | null)?.focus(); menuMessage = null; } }} />

{#if disponible}
  <section class="messagerie" id="circle-messages" aria-labelledby="messages-titre">
    <h2 id="messages-titre">{tr('v2.circle.msg.title')} {#if total}<span class="pastille">{total}</span>{/if}</h2>
    {#if erreur}<p role="alert" class="erreur">{erreur}</p>{/if}
    <div class="volets" class:fil-ouvert={choix !== null}>
      <nav aria-label={tr('v2.circle.msg.title')}>
        {#if !liste.length}<p class="note">{tr('v2.circle.msg.empty')}</p>{/if}
        {#each liste as c (c.id)}
          <button type="button" class="conversation" class:choisie={choix?.id === c.id} aria-current={choix?.id === c.id ? 'true' : undefined} disabled={occupe} onclick={() => void geste(() => ouvrir(c))}>
            <span class="avatar" aria-hidden="true">{initiales(c.contact.name)}</span>
            <span class="resume"><strong>{c.contact.name}</strong><span class="extrait" use:bulleTexte>{c.last_message?.body ?? c.last_message?.card?.title ?? tr('v2.circle.msg.noMessage')}</span></span>
            <span class="repere"><time datetime={c.last_message?.created_at}>{heure(c.last_message?.created_at ?? '', true)}</time>{#if c.unread_count}<span class="pastille">{c.unread_count}</span>{/if}</span>
          </button>
        {/each}
      </nav>
      {#if choix}
        <div class="fil">
          <header class="entete"><button type="button" class="retour" onclick={retour} aria-label={tr('nowplaying.back')}>←</button><span class="avatar" aria-hidden="true">{initiales(choix.contact.name)}</span><h3>{choix.contact.name}</h3></header>
          <div class="defilement" bind:this={defilement}>
            {#if cursor}<button class="anciens" type="button" disabled={occupe} onclick={() => void geste(() => page(choix!.id, cursor!))}>{tr('v2.circle.msg.older')}</button>{/if}
            <ol class="messages" aria-label={choix.contact.name}>
              {#each chronologiques as m, i (m.id)}
                {@const debutJour = i === 0 || jour(m.created_at) !== jour(chronologiques[i - 1].created_at)}
                {@const groupe = !debutJour && chronologiques[i - 1].sender_id === m.sender_id}
                {#if debutJour && dateJour(m.created_at)}<li class="jour"><span>{dateJour(m.created_at)}</span></li>{/if}
                <li class="message" class:mon-message={m.mine} class:groupe>
                  <div class="bulle">
                    {#if !m.mine && !groupe}<div class="auteur">{choix.contact.name}</div>{/if}
                    {#if m.body}<p class="texte">{m.body}</p>{/if}
                    {#if m.card}
                      <article class="carte">
                        {#if m.card.cover_url}<img src={m.card.cover_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
                        <div><strong>{m.card.title}</strong>{#if m.card.artist_name}<p>{m.card.artist_name}</p>{/if}</div>
                        <div class="gestes">
                          <button type="button" disabled={occupe} onclick={() => void geste(() => ecouterCarte(m.card!))}>{tr('v2.circle.msg.playHere')}</button>
                          <button type="button" disabled={occupe} onclick={() => void geste(() => garderCarte(m.card!))}>{tr('v2.later.add')}</button>
                        </div>
                      </article>
                    {/if}
                  </div>
                  <div class="pied-message"><time datetime={m.created_at}>{heure(m.created_at)}</time>
                    <div class="actions-message">
                      <button class="menu-bouton" type="button" aria-label={tr('v2.circle.msg.actions')} aria-expanded={menuMessage === m.id} onclick={() => menuMessage = menuMessage === m.id ? null : m.id}>⋯</button>
                      {#if menuMessage === m.id}
                        <div class="menu-message" role="group" aria-label={tr('v2.circle.msg.actions')}>
                          {#if m.mine}<button type="button" disabled={occupe} onclick={() => void supprimer(m)}>{tr('common.delete')}</button>
                          {:else}<label><input type="checkbox" checked={selection.includes(m.id)} disabled={!selection.includes(m.id) && selection.length >= 20} onchange={(ev) => cocher(m.id, ev.currentTarget.checked)} />{tr('v2.circle.msg.select')}</label><button type="button" onclick={() => { cocher(m.id, true); signalement = true; menuMessage = null; }}>{tr('v2.circle.msg.report')}</button>{/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                </li>
              {/each}
            </ol>
          </div>
          <p class="sr-only" aria-live="polite" aria-atomic="true">{chronologiques.at(-1)?.body ?? chronologiques.at(-1)?.card?.title ?? ''}</p>
          <form class="composeur" bind:this={formulaire} onsubmit={envoyer}>
            <textarea id="message-texte" aria-label={tr('v2.circle.msg.write')} placeholder={tr('v2.circle.msg.write')} bind:this={saisie} bind:value={texte} oninput={ajusterSaisie} onkeydown={clavier} rows="1" maxlength="8000" disabled={occupe}></textarea>
            <button class="envoi" type="submit" aria-label={tr('v2.circle.msg.send')} disabled={occupe || !messageEnvoyable(texte, null)}><span aria-hidden="true">↑</span></button>
            {#if longueurMessage(texte) >= 3500}<span class="compteur note">{longueurMessage(texte)} / {MESSAGE_MAX}</span>{/if}
          </form>
          <p class="note moderation"><span aria-hidden="true">ⓘ</span> {tr('v2.circle.msg.privacy')}</p>
          {#if selection.length}<button type="button" onclick={() => signalement = !signalement}>{tr('v2.circle.msg.report')} ({selection.length})</button>{/if}
          {#if signalement}
            <form class="signalement" onsubmit={signaler}>
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
      {:else}<p class="note attente">{tr('v2.circle.msg.emptyThread')}</p>{/if}
    </div>
  </section>
{:else if erreur}<p role="alert">{erreur}</p>{/if}

<style>
  .messagerie{margin:24px 0;color:var(--v2-txt);scroll-margin-top:24px}
  h2{font-size:18px;margin:0 0 12px}h3{font-size:15px;margin:0;min-width:0;overflow-wrap:anywhere}
  .volets{display:grid;grid-template-columns:minmax(190px,1fr) minmax(0,3fr);border:1px solid var(--v2-line);border-radius:16px;overflow:hidden;background:var(--v2-bg)}
  nav{display:flex;flex-direction:column;gap:2px;padding:8px;border-right:1px solid var(--v2-line);max-height:620px;overflow:auto}
  button,select,textarea{font:inherit;color:inherit;border:1px solid var(--v2-line);background:var(--v2-surface2);border-radius:8px;padding:8px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}
  button:focus-visible,textarea:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--v2-acc1);outline-offset:3px}
  .conversation{display:flex;align-items:center;gap:10px;text-align:left;width:100%;padding:12px 8px;border:0;background:transparent;min-width:0}.conversation:hover{background:var(--v2-hover)}.conversation.choisie{background:var(--v2-active1)}
  .avatar{display:grid;place-items:center;flex-shrink:0;width:36px;height:36px;border-radius:50%;background:var(--v2-surface2);font-size:12px;font-weight:600;color:var(--v2-txt)}
  .resume{flex:1;min-width:0}.resume strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.extrait{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--v2-txt2);margin-top:4px}
  .repere{display:flex;flex-direction:column;align-items:end;gap:6px}.repere time{font-size:10px;color:var(--v2-txt2);white-space:nowrap}.pastille{border-radius:12px;padding:2px 7px;background:var(--v2-acc1);color:var(--v2-on-acc);font-size:11px}
  .fil{min-width:0;display:flex;flex-direction:column}.entete{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--v2-line)}.retour{display:none}
  .defilement{height:clamp(220px,42vh,420px);overflow:auto;overscroll-behavior:contain;padding:12px 20px;overflow-anchor:none}.anciens{display:block;margin:0 auto 16px;font-size:12px}
  .messages{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}.message{align-self:flex-start;max-width:70%;min-width:0;overflow-wrap:anywhere}.message.mon-message{align-self:flex-end}.message.groupe{margin-top:-6px}
  .bulle{padding:10px 14px;border-radius:16px 16px 16px 4px;background:var(--v2-surface2);color:var(--v2-txt)}.mon-message .bulle{background:color-mix(in srgb,var(--v2-acc1) 14%,var(--v2-surface));border-radius:16px 16px 4px 16px}
  .auteur{font-size:11px;font-weight:600;color:var(--v2-txt2);margin-bottom:4px}.texte{white-space:pre-wrap;margin:0;font-size:14px;line-height:1.5}.pied-message{display:flex;gap:6px;align-items:center;min-height:22px;color:var(--v2-txt2);font-size:10px;padding:2px 5px}.mon-message .pied-message{justify-content:flex-end}
  .jour{align-self:stretch;display:flex;justify-content:center;margin:10px 0;color:var(--v2-txt2);font-size:11px}.jour span{padding:3px 10px;border-radius:12px;background:var(--v2-bg2)}
  .actions-message{position:relative}.menu-bouton{opacity:0;pointer-events:none;border:0;background:transparent;padding:0 5px;line-height:20px;font-size:18px}.message:hover .menu-bouton,.message:focus-within .menu-bouton{opacity:1;pointer-events:auto}.menu-message{position:absolute;bottom:24px;left:0;z-index:2;display:flex;flex-direction:column;gap:8px;padding:10px;min-width:140px;background:var(--v2-surface2);border:1px solid var(--v2-line);border-radius:10px;font-size:12px;color:var(--v2-txt)}.mon-message .menu-message{left:auto;right:0}
  .composeur{display:flex;align-items:flex-end;flex-wrap:wrap;gap:10px;padding:12px 16px 4px;margin:0}.composeur textarea{flex:1;min-width:0;min-height:40px;max-height:158px;line-height:24px;padding:7px 12px;resize:none;box-sizing:border-box}.envoi{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;border:0;border-radius:50%;background:var(--v2-acc1);color:var(--v2-on-acc);font-size:24px}.compteur{width:100%;text-align:right}
  .note{font-size:12px;color:var(--v2-txt2)}.moderation{font-size:11px;line-height:1.5;margin:8px 16px 12px}.erreur{color:var(--v2-danger)}.attente{padding:20px}.signalement{display:flex;flex-direction:column;gap:6px;margin:12px 16px}.gestes{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;font-size:12px}.carte{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.carte img{width:64px;height:64px;object-fit:contain}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  @media(hover:none){.menu-bouton{opacity:1;pointer-events:auto}}
  @media(max-width:699px){.volets{grid-template-columns:minmax(0,1fr)}nav{border-right:0;max-height:65dvh}.fil-ouvert nav{display:none}.retour{display:block;border:0;background:transparent}.attente{display:none}.defilement{height:clamp(180px,40dvh,400px);padding:10px 12px}.message{max-width:72%}.composeur{padding:10px 12px 4px}.moderation{margin:8px 12px 12px}}
</style>
