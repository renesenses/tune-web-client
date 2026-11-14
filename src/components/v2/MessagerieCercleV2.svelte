<script lang="ts">
  import { onMount, tick } from 'svelte';
  // #2527 — la carte « thème » (Mon thème) dans le fil.
  import CarteThemeCercleV2 from './CarteThemeCercleV2.svelte';
  // #2853 — emojis : sélecteur, raccourcis « :) » à l'envoi, grands emojis seuls.
  import SuggestionEmojiV2 from './SuggestionEmojiV2.svelte';
  import SelecteurEmojiV2 from './SelecteurEmojiV2.svelte';
  import { insererEmoji, convertirRaccourcis, raccourcisActifs, grandsEmojis } from '../../lib/emojis';
  import { t, locale } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { dialogs } from '../../lib/stores/dialogs';
  import { motifCercle } from '../../lib/circle';
  import { relireNotifications } from '../../lib/circleNotifications';
  import { messagerieSupport, conversations, ouvrirConversation, ouvrirConversationCercle, ouvrirFilGeneral, consentirPseudo, refusFautePseudo, ADHESION_GENERALE_CHANGEE, lireMessages, envoyerMessage, envoyerAuCercle, reglerEcritureCercle, nomConversation, ecritureOuverte, effacerMessage, signalerMessages, marquerConversationLue, demandeConversation, erreurOuvertureConversation, ecouterCarte, garderCarte, longueurMessage, messageEnvoyable, MESSAGE_MAX, RELECTURE_MESSAGES_MS, type ConversationCercle, type MessageCercle, type CarteMusique, type EcritureCercle } from '../../lib/circleMessagerie';

  let disponible = $state(false);
  let liste = $state<ConversationCercle[]>([]);
  let choix = $state<ConversationCercle | null>(null);
  let messages = $state<MessageCercle[]>([]);
  let cursor = $state<string | null>(null);
  let texte = $state('');
  let occupe = $state(false);
  let erreur = $state('');
  let accuse = $state('');
  let selection = $state<number[]>([]);
  let signalement = $state(false);
  let raison = $state('harassment');
  let commentaire = $state('');
  let defilement = $state<HTMLDivElement>();
  let saisie = $state<HTMLTextAreaElement>();
  let formulaire = $state<HTMLFormElement>();
  let menuMessage = $state<number | null>(null);
  let emojis = $state(false);
  let boutonEmoji = $state<HTMLButtonElement>();
  let fini = false;
  let generation = 0;
  let dernierTour = 0;
  const tr = (k: string) => $t(k as any);
  const chronologiques = $derived([...messages].sort((a, b) => a.id - b.id));
  const total = $derived(liste.reduce((n, c) => n + c.unread_count, 0));

  /** rc11 — un cercle a « # » pour avatar ; un contact, ses initiales. */
  function avatar(c: ConversationCercle) { return c.kind === 'direct' ? initiales(c.contact.name) : '#'; }
  /** L'auteur d'un message reçu : le contact en privé ; dans un cercle (rc11) ou un cercle général (rc12), son nom tant qu'il est membre. */
  function auteur(c: ConversationCercle, m: MessageCercle) { return c.kind === 'direct' ? c.contact.name : (m.sender_name ?? tr('v2.circle.msg.formerMember')); }
  /** rc12 — avant le premier texte ou la première carte dans un cercle général :
   *  l'acceptation du pseudo, enregistrée par le cloud. `false` : refus, rien n'est envoyé. */
  async function pseudoAccepte(id: number): Promise<boolean> {
    if (choix?.kind !== 'general' || choix.id !== id || !choix.name_consent_required) return true;
    const tour = generation;
    if (!(await dialogs.confirm(tr('v2.circle.general.nameConsent').replace('{circle}', choix.circle.name))) || fini || tour !== generation || choix?.id !== id) return false;
    await consentirPseudo(id);
    if (fini || tour !== generation || choix?.kind !== 'general' || choix.id !== id) return false;
    choix = { ...choix, name_consent_required: false };
    liste = liste.map((c) => c.id === id && c.kind === 'general' ? { ...c, name_consent_required: false } : c);
    return true;
  }
  async function regler(write: EcritureCercle) {
    if (choix?.kind !== 'circle' || !choix.circle.mine) return;
    const id = choix.id; const cercle = choix.circle.id;
    await geste(async () => { await reglerEcritureCercle(cercle, write); if (choix?.id === id) await page(id, undefined, true); });
  }
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
  // Recette rc12 (14/11) : `scrollHeight` n'inclut pas les bordures alors que
  // le champ est en `box-sizing:border-box` — la hauteur posée manquait de
  // 2 px, et l'`overflow:auto` natif sortait l'ascenseur de 14 px qui
  // mangeait le texte indicatif. On ajoute les bordures et l'ascenseur ne
  // revient qu'au-delà de la hauteur maximale. Garde : composeurSansAscenseur.test.ts.
  const SAISIE_MAX = 158;
  function ajusterSaisie() {
    if (!saisie) return;
    saisie.style.height = 'auto';
    const bords = saisie.offsetHeight - saisie.clientHeight;
    const voulue = saisie.scrollHeight + Math.max(0, bords);
    saisie.style.height = `${Math.min(voulue, SAISIE_MAX)}px`;
    saisie.style.overflowY = voulue > SAISIE_MAX ? 'auto' : 'hidden';
  }
  $effect(() => { if (saisie) ajusterSaisie(); });
  async function bas() { await tick(); if (defilement) defilement.scrollTop = defilement.scrollHeight; }
  function clavier(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); ev.stopPropagation(); if (!occupe && messageEnvoyable(texte, null)) formulaire?.requestSubmit(); }
  }
  async function ajouterEmoji(e: string) {
    const r = insererEmoji(texte, saisie?.selectionStart, saisie?.selectionEnd, e);
    texte = r.texte;
    await tick();
    saisie?.setSelectionRange(r.curseur, r.curseur);
    ajusterSaisie();
  }
  function fermerEmojis(rendreFocus = true) { emojis = false; if (rendreFocus) saisie?.focus(); }
  function retour() { generation++; choix = null; messages = []; selection = []; viderBrouillons(); }
  function viderBrouillons() { texte = ''; emojis = false; accuse = ''; menuMessage = null; ajusterSaisie(); commentaire = ''; raison = 'harassment'; signalement = false; }
  function echec(e: unknown) {
    if (refusFautePseudo(e)) {
      // Le cloud a perdu (ou jamais reçu) l'acceptation : on la redemandera au prochain envoi.
      if (choix?.kind === 'general') choix = { ...choix, name_consent_required: true };
      erreur = tr('v2.circle.general.nameConsentNeeded');
      return;
    }
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
    occupe = true; erreur = ''; accuse = '';
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
      if (d.general) {
        erreurOuvertureConversation.set(null);
        const c = await ouvrirFilGeneral(d.general);
        if (fini) return;
        disponible = true;
        if (!liste.some((l) => l.id === c.id)) liste = [c, ...liste];
        await ouvrir(c);
      } else if (d.cercle) {
        erreurOuvertureConversation.set(null);
        const c = await ouvrirConversationCercle(d.cercle);
        if (fini) return;
        disponible = true;
        if (!liste.some((l) => l.id === c.id)) liste = [c, ...liste];
        await ouvrir(c);
      } else if (d.contact) {
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
      if (fini || !choix || erreur) return;
      document.getElementById('circle-messages')?.scrollIntoView?.({ block: 'start' });
      (document.getElementById('message-texte') as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
    });
  });
  async function envoyer(ev: SubmitEvent) {
    ev.preventDefault();
    if (!choix || !ecritureOuverte(choix) || !messageEnvoyable(texte, null)) return;
    const id = choix.id; const brouillon = raccourcisActifs() ? convertirRaccourcis(texte) : texte; const cercle = choix.kind === 'circle' ? choix.circle.id : null;
    emojis = false;
    await geste(async () => { if (!(await pseudoAccepte(id))) return; await (cercle !== null ? envoyerAuCercle(cercle, brouillon) : envoyerMessage(id, brouillon)); if (choix?.id === id) { texte = ''; await tick(); ajusterSaisie(); } await charger(); if (choix?.id === id) await bas(); });
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
    if (!(await dialogs.confirm(tr('v2.circle.msg.reportConfirm'))) || choix?.id !== id) return;
    await geste(async () => { await signalerMessages(id, selection, raison, commentaire); signalement = false; selection = []; commentaire = ''; accuse = tr('v2.circle.msg.reportSent'); });
  }
  onMount(() => {
    void charger();
    const tour = () => { if (!document.hidden && !occupe && Date.now() - dernierTour >= RELECTURE_MESSAGES_MS) void charger(); };
    const timer = setInterval(tour, RELECTURE_MESSAGES_MS);
    document.addEventListener('visibilitychange', tour);
    // rc12 — quitter un cercle général : son fil disparaît tout de suite, ouvert ou non.
    const adhesion = (ev: Event) => {
      const general = (ev as CustomEvent<{ general?: number }>).detail?.general;
      const parti = (c: ConversationCercle) => c.kind === 'general' && (general === undefined || c.circle.id === general);
      generation++;
      liste = liste.filter((c) => !parti(c));
      if (choix && parti(choix)) { choix = null; messages = []; selection = []; viderBrouillons(); }
      void charger();
    };
    window.addEventListener(ADHESION_GENERALE_CHANGEE, adhesion);
    return () => { fini = true; clearInterval(timer); document.removeEventListener('visibilitychange', tour); window.removeEventListener(ADHESION_GENERALE_CHANGEE, adhesion); };
  });
</script>

<svelte:window onkeydown={(ev) => { if (ev.key === 'Escape' && menuMessage !== null) { (document.querySelector('#circle-messages .menu-bouton[aria-expanded="true"]') as HTMLButtonElement | null)?.focus(); menuMessage = null; } }} />

{#if disponible}
  <section class="messagerie" id="circle-messages" aria-labelledby="messages-titre">
    <h2 id="messages-titre">{tr('v2.circle.msg.title')} {#if total}<span class="pastille">{total}</span>{/if}</h2>
    {#if erreur}<p role="alert" class="erreur">{erreur}</p>{/if}
    {#if accuse}<p role="status" class="note">{accuse}</p>{/if}
    <div class="volets" class:fil-ouvert={choix !== null}>
      <nav aria-label={tr('v2.circle.msg.title')}>
        {#if !liste.length}<p class="note">{tr('v2.circle.msg.empty')}</p>{/if}
        {#each liste as c (c.id)}
          <button type="button" class="conversation" class:choisie={choix?.id === c.id} aria-current={choix?.id === c.id ? 'true' : undefined} disabled={occupe} onclick={() => void geste(() => ouvrir(c))}>
            <span class="avatar" class:avatar-cercle={c.kind !== 'direct'} aria-hidden="true">{avatar(c)}</span>
            <span class="resume"><strong>{nomConversation(c)}</strong>{#if c.kind === 'circle' && !c.circle.mine}<span class="extrait" use:bulleTexte>{tr('v2.circle.msg.circleOf').replace('{name}', c.circle.owner_name)}</span>{:else if c.kind === 'general'}<span class="extrait" use:bulleTexte>{tr('v2.circle.general.label')}</span>{/if}<span class="extrait" use:bulleTexte>{c.last_message?.body ?? c.last_message?.card?.title ?? tr('v2.circle.msg.noMessage')}</span></span>
            <span class="repere"><time datetime={c.last_message?.created_at}>{heure(c.last_message?.created_at ?? '', true)}</time>{#if c.unread_count}<span class="pastille">{c.unread_count}</span>{/if}</span>
          </button>
        {/each}
      </nav>
      {#if choix}
        <div class="fil">
          <header class="entete-fil"><button type="button" class="retour" onclick={retour} aria-label={tr('nowplaying.back')}>←</button><span class="avatar" class:avatar-cercle={choix.kind !== 'direct'} aria-hidden="true">{avatar(choix)}</span><h3>{nomConversation(choix)}</h3>
            {#if choix.kind === 'circle' && choix.circle.mine}
              <label class="reglage-ecriture">{tr('v2.circle.msg.writeSetting')}
                <select value={choix.circle.write} disabled={occupe} onchange={(ev) => void regler(ev.currentTarget.value as EcritureCercle)}>
                  <option value="all">{tr('v2.circle.msg.writeAll')}</option>
                  <option value="owner">{tr('v2.circle.msg.writeOwner')}</option>
                </select>
              </label>
            {/if}</header>
          <div class="defilement" bind:this={defilement}>
            {#if cursor}<button class="anciens" type="button" disabled={occupe} onclick={() => void geste(() => page(choix!.id, cursor!))}>{tr('v2.circle.msg.older')}</button>{/if}
            <ol class="messages" aria-label={nomConversation(choix)}>
              {#each chronologiques as m, i (m.id)}
                {@const debutJour = i === 0 || jour(m.created_at) !== jour(chronologiques[i - 1].created_at)}
                {@const groupe = !debutJour && chronologiques[i - 1].sender_id === m.sender_id}
                {#if debutJour && dateJour(m.created_at)}<li class="jour"><span>{dateJour(m.created_at)}</span></li>{/if}
                <li class="message" class:mon-message={m.mine} class:groupe>
                  <div class="bulle">
                    {#if !m.mine && !groupe}<div class="auteur">{auteur(choix, m)}</div>{/if}
                    {#if m.body}<p class="texte" class:grands-emojis={grandsEmojis(m.body)}>{m.body}</p>{/if}
                    {#if m.card && m.card.type === 'theme'}
                      <CarteThemeCercleV2 carte={m.card} />
                    {:else if m.card}
                      <article class="carte">
                        {#if m.card.cover_url}<img src={m.card.cover_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
                        <div><strong>{m.card.title}</strong>{#if m.card.artist_name}<p>{m.card.artist_name}</p>{/if}</div>
                        <div class="gestes">
                          <button type="button" disabled={occupe} onclick={() => void geste(() => ecouterCarte(m.card as CarteMusique))}>{tr('v2.circle.msg.playHere')}</button>
                          <button type="button" disabled={occupe} onclick={() => void geste(() => garderCarte(m.card as CarteMusique))}>{tr('v2.later.add')}</button>
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
          {#if !ecritureOuverte(choix)}<p class="note lecture-seule" role="status">{tr('v2.circle.msg.ownerOnly')}</p>{:else}
          <form class="composeur" bind:this={formulaire} onsubmit={envoyer} onfocusout={(ev) => { if (emojis && ev.relatedTarget instanceof Node && !formulaire?.contains(ev.relatedTarget)) emojis = false; }}>
      <SuggestionEmojiV2 {saisie} {texte} disponible={!occupe && !emojis} onchoisir={(e) => void ajouterEmoji(e)} />
            {#if emojis}<div class="ligne-emojis"><SelecteurEmojiV2 id="message-emojis" onchoisir={(e) => void ajouterEmoji(e)} onfermer={() => { fermerEmojis(false); boutonEmoji?.focus(); }} /></div>{/if}
            <button class="bouton-emoji" type="button" bind:this={boutonEmoji} aria-label={tr('v2.circle.emoji.open')} title={tr('v2.circle.emoji.open')} aria-expanded={emojis} aria-controls={emojis ? 'message-emojis' : undefined} disabled={occupe} onclick={() => emojis = !emojis}><span aria-hidden="true">🙂</span></button>
            <textarea id="message-texte" aria-label={tr('v2.circle.msg.write')} placeholder={tr('v2.circle.msg.write')} bind:this={saisie} bind:value={texte} oninput={ajusterSaisie} onkeydown={clavier} rows="1" maxlength="8000" disabled={occupe}></textarea>
            <button class="envoi" type="submit" aria-label={tr('v2.circle.msg.send')} disabled={occupe || !messageEnvoyable(texte, null)}><span aria-hidden="true">↑</span></button>
            {#if longueurMessage(texte) >= 3500}<span class="compteur note">{longueurMessage(texte)} / {MESSAGE_MAX}</span>{/if}
          </form>{/if}
          <p class="note moderation"><span aria-hidden="true">ⓘ</span> {tr(choix.kind === 'circle' ? 'v2.circle.msg.circlePrivacy' : choix.kind === 'general' ? 'v2.circle.general.privacy' : 'v2.circle.msg.privacy')}</p>
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
  h2{font-size:calc(18px * var(--v2-txt-echelle, 1));margin:0 0 12px}h3{font-size:calc(15px * var(--v2-txt-echelle, 1));margin:0;min-width:0;overflow-wrap:anywhere}
  .volets{display:grid;grid-template-columns:minmax(190px,1fr) minmax(0,3fr);border:1px solid var(--v2-line);border-radius:16px;overflow:hidden;background:var(--v2-bg)}
  nav{display:flex;flex-direction:column;gap:2px;padding:8px;border-right:1px solid var(--v2-line);max-height:620px;overflow:auto}
  button,select,textarea{font:inherit;color:inherit;border:1px solid var(--v2-line);background:var(--v2-surface2);border-radius:8px;padding:8px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}
  button:focus-visible,textarea:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--v2-acc1);outline-offset:3px}
  .conversation{display:flex;align-items:center;gap:10px;text-align:left;width:100%;padding:12px 8px;border:0;background:transparent;min-width:0}.conversation:hover{background:var(--v2-hover)}.conversation.choisie{background:var(--v2-active1)}
  .avatar{display:grid;place-items:center;flex-shrink:0;width:36px;height:36px;border-radius:50%;background:var(--v2-surface2);font-size:calc(12px * var(--v2-txt-echelle, 1));font-weight:600;color:var(--v2-txt)}
  .resume{flex:1;min-width:0}.resume strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(13px * var(--v2-txt-echelle, 1))}.extrait{font-family:var(--font-primary,sans-serif),'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji';display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(12px * var(--v2-txt-echelle, 1));color:var(--v2-txt2);margin-top:4px}
  .repere{display:flex;flex-direction:column;align-items:end;gap:6px}.repere time{font-size:calc(10px * var(--v2-txt-echelle, 1));color:var(--v2-txt2);white-space:nowrap}.pastille{border-radius:12px;padding:2px 7px;background:var(--v2-acc1);color:var(--v2-on-acc);font-size:calc(11px * var(--v2-txt-echelle, 1))}
  .avatar-cercle{font-size:calc(16px * var(--v2-txt-echelle, 1));color:var(--v2-acc1)}.reglage-ecriture{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:calc(12px * var(--v2-txt-echelle, 1));color:var(--v2-txt2)}.reglage-ecriture select{padding:4px 6px;font-size:calc(12px * var(--v2-txt-echelle, 1))}.lecture-seule{margin:12px 16px 4px}
  .fil{min-width:0;display:flex;flex-direction:column}.entete-fil{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--v2-line)}.retour{display:none}
  .defilement{height:clamp(220px,42vh,420px);overflow:auto;overscroll-behavior:contain;padding:12px 20px;overflow-anchor:none}.anciens{display:block;margin:0 auto 16px;font-size:calc(12px * var(--v2-txt-echelle, 1))}
  .messages{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}.message{align-self:flex-start;max-width:70%;min-width:0;overflow-wrap:anywhere}.message.mon-message{align-self:flex-end}.message.groupe{margin-top:-6px}
  .bulle{padding:10px 14px;border-radius:16px 16px 16px 4px;background:var(--v2-surface2);color:var(--v2-txt)}.mon-message .bulle{background:color-mix(in srgb,var(--v2-acc1) 14%,var(--v2-surface));border-radius:16px 16px 4px 16px}
  .auteur{font-size:calc(11px * var(--v2-txt-echelle, 1));font-weight:600;color:var(--v2-txt2);margin-bottom:4px}.texte{white-space:pre-wrap;margin:0;font-size:calc(14px * var(--v2-txt-echelle, 1));line-height:1.5;font-family:var(--font-primary,sans-serif),'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Segoe UI Symbol'}.texte.grands-emojis{font-size:calc(34px * var(--v2-txt-echelle, 1));line-height:1.25}.pied-message{display:flex;gap:6px;align-items:center;min-height:22px;color:var(--v2-txt2);font-size:calc(10px * var(--v2-txt-echelle, 1));padding:2px 5px}.mon-message .pied-message{justify-content:flex-end}
  .jour{align-self:stretch;display:flex;justify-content:center;margin:10px 0;color:var(--v2-txt2);font-size:calc(11px * var(--v2-txt-echelle, 1))}.jour span{padding:3px 10px;border-radius:12px;background:var(--v2-bg2)}
  .actions-message{position:relative}.menu-bouton{opacity:0;pointer-events:none;border:0;background:transparent;padding:0 5px;line-height:20px;font-size:calc(18px * var(--v2-txt-echelle, 1))}.message:hover .menu-bouton,.message:focus-within .menu-bouton{opacity:1;pointer-events:auto}.menu-message{position:absolute;bottom:24px;left:0;z-index:2;display:flex;flex-direction:column;gap:8px;padding:10px;min-width:140px;background:var(--v2-surface2);border:1px solid var(--v2-line);border-radius:10px;font-size:calc(12px * var(--v2-txt-echelle, 1));color:var(--v2-txt)}.mon-message .menu-message{left:auto;right:0}
  .ligne-emojis{flex:1 1 100%;min-width:0}.composeur{position:relative;display:flex;align-items:flex-end;flex-wrap:wrap;gap:10px;padding:12px 16px 4px;margin:0}.composeur :global([data-suggestion-emoji]){position:absolute;bottom:100%;inset-inline-start:16px;max-width:calc(100% - 32px);z-index:2}.bouton-emoji{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;font-size:calc(22px * var(--v2-txt-echelle, 1));line-height:1;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}.bouton-emoji:hover,.bouton-emoji[aria-expanded='true']{background:var(--v2-hover)}.composeur textarea{font-family:var(--font-primary,sans-serif),'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji';flex:1;min-width:0;min-height:40px;max-height:158px;line-height:24px;padding:7px 12px;resize:none;box-sizing:border-box;overflow-x:hidden;overflow-y:hidden}.composeur textarea::placeholder{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.envoi{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;border:0;border-radius:50%;background:var(--v2-acc1);color:var(--v2-on-acc);font-size:calc(24px * var(--v2-txt-echelle, 1))}.compteur{width:100%;text-align:right}
  .note{font-size:calc(12px * var(--v2-txt-echelle, 1));color:var(--v2-txt2)}.moderation{font-size:calc(11px * var(--v2-txt-echelle, 1));line-height:1.5;margin:8px 16px 12px}.erreur{color:var(--v2-danger)}.attente{padding:20px}.signalement{display:flex;flex-direction:column;gap:6px;margin:12px 16px}.gestes{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;font-size:calc(12px * var(--v2-txt-echelle, 1))}.carte{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.carte img{width:64px;height:64px;object-fit:contain}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  @media(hover:none){.menu-bouton{opacity:1;pointer-events:auto}}
  @media(max-width:699px){.volets{grid-template-columns:minmax(0,1fr)}nav{border-right:0;max-height:65dvh}.fil-ouvert nav{display:none}.retour{display:block;border:0;background:transparent}.attente{display:none}.defilement{height:clamp(180px,40dvh,400px);padding:10px 12px}.message{max-width:72%}.composeur{padding:10px 12px 4px}.moderation{margin:8px 12px 12px}}
</style>
