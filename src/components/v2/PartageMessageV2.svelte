<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { getCercle, estConnecte, motifCercle, type ContactCercle } from '../../lib/circle';
  import { carteAPartager, ouvrirConversation, cerclesGeneraux, ouvrirFilGeneral, consentirPseudo, type CercleGeneral, envoyerMessage, messageEnvoyable, longueurMessage, MESSAGE_MAX, type CarteCercle } from '../../lib/circleMessagerie';
  // #2853 — emojis : le même sélecteur que la messagerie, raccourcis « :) » à l'envoi.
  import SelecteurEmojiV2 from './SelecteurEmojiV2.svelte';
  import { insererEmoji, convertirRaccourcis, raccourcisActifs } from '../../lib/emojis';
  let { carte }: { carte: CarteCercle } = $props();
  let emojis = $state(false);
  let saisie = $state<HTMLTextAreaElement>();
  let boutonEmoji = $state<HTMLButtonElement>();
  async function ajouterEmoji(e: string) {
    const r = insererEmoji(texte, saisie?.selectionStart, saisie?.selectionEnd, e);
    texte = r.texte;
    await tick();
    saisie?.setSelectionRange(r.curseur, r.curseur);
  }
  let contacts = $state<ContactCercle[]>([]);
  // rc12 — un contact (son id) ou un cercle général rejoint (`general:<id>`).
  let destinataire = $state<number | string>('');
  let generaux = $state<CercleGeneral[]>([]);
  let confirmation = false;
  let fini = false;
  // #2527 — un thème part avec un texte lisible : les clients qui ne
  // connaissent pas la carte « thème » (télécommandes) montrent au moins ce texte.
  let texte = $state(carte.type === 'theme' ? $t('monTheme.carteTexte' as any).replace('{nom}', carte.title) : '');
  let occupe = $state(false);
  let erreur = $state('');
  const tr = (k: string) => $t(k as any);
  let panneau: HTMLElement;
  onMount(() => {
    const avant = document.activeElement as HTMLElement | null;
    void tick().then(() => panneau?.focus());
    void getCercle().then((e) => { contacts = estConnecte(e) ? e.members : []; }).catch((e) => erreur = tr(motifCercle(e).cle));
    // Site sans cercles généraux (404) ou hors ligne : seulement les contacts.
    void cerclesGeneraux().then((l) => { if (!fini) generaux = l.filter((c) => c.joined); }).catch(() => {});
    return () => { fini = true; avant?.focus(); };
  });
  function clavier(ev: KeyboardEvent) {
    if (confirmation) return;
    if (ev.key === 'Escape' && !occupe) { ev.preventDefault(); carteAPartager.set(null); }
    if (ev.key !== 'Tab' || !panneau) return;
    const cibles = [...panneau.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    const premier = cibles[0], dernier = cibles.at(-1);
    if (ev.shiftKey && (document.activeElement === premier || document.activeElement === panneau)) { ev.preventDefault(); dernier?.focus(); }
    else if (!ev.shiftKey && document.activeElement === dernier) { ev.preventDefault(); premier?.focus(); }
  }
  async function envoyer(ev: SubmitEvent) {
    ev.preventDefault(); if (!destinataire || occupe) return;
    occupe = true; erreur = '';
    try {
      const cible = String(destinataire);
      const c = cible.startsWith('general:') ? await ouvrirFilGeneral(Number(cible.slice(8))) : await ouvrirConversation(Number(destinataire));
      if (fini) return;
      // rc12 — dans un cercle général, la première carte demande aussi l'acceptation du pseudo.
      if (c.kind === 'general' && c.name_consent_required) {
        confirmation = true;
        let accepte = false;
        try { accepte = await dialogs.confirm(tr('v2.circle.general.nameConsent').replace('{circle}', c.circle.name)); } finally { confirmation = false; }
        if (!accepte || fini) return;
        await consentirPseudo(c.id);
        if (fini) return;
      }
      await envoyerMessage(c.id, raccourcisActifs() ? convertirRaccourcis(texte) : texte, carte); carteAPartager.set(null);
    }
    catch (e) { erreur = tr(motifCercle(e).cle); }
    finally { occupe = false; }
  }
</script>

<svelte:window onkeydown={clavier} />
<div class="fond">
  <section bind:this={panneau} class="partage" role="dialog" aria-modal="true" aria-labelledby="partage-message-titre" tabindex="-1">
    <h2 id="partage-message-titre">{tr('v2.circle.msg.share')}</h2>
    <p><strong>{carte.title}</strong>{#if carte.type !== 'theme' && carte.artist_name} · {carte.artist_name}{/if}</p>
    {#if carte.type === 'theme'}
      <p class="nuancier" data-nuancier-theme>{#each ['--v2-bg', '--v2-surface', '--v2-txt', '--v2-acc1', '--v2-acc2'] as j (j)}<span style="background:{carte.colors[j]}"></span>{/each}</p>
    {/if}
    <p class="note">{tr('v2.circle.msg.privacy')}</p>
    {#if erreur}<p role="alert">{erreur}</p>{/if}
    {#if !contacts.length && !generaux.length}<p>{tr('v2.circle.msg.empty')}</p>{/if}
    <form onsubmit={envoyer}>
      <label for="message-contact">{tr('v2.circle.msg.recipient')}</label>
      <select id="message-contact" bind:value={destinataire} disabled={occupe}>
        <option value="">—</option>
        {#each contacts as c (c.user_id)}<option value={c.user_id}>{c.name}</option>{/each}
        {#each generaux as c (c.id)}<option value={`general:${c.id}`}>{tr('v2.circle.general.label')} · # {c.name}</option>{/each}
      </select>
      <label for="message-partage-texte">{tr('v2.circle.msg.write')}</label>
      <textarea id="message-partage-texte" bind:this={saisie} bind:value={texte} rows="3" maxlength="8000" disabled={occupe}></textarea>
      <div class="ligne-saisie">
        <button class="bouton-emoji" type="button" bind:this={boutonEmoji} aria-label={tr('v2.circle.emoji.open')} title={tr('v2.circle.emoji.open')} aria-expanded={emojis} aria-controls={emojis ? 'partage-emojis' : undefined} disabled={occupe} onclick={() => emojis = !emojis}><span aria-hidden="true">🙂</span></button>
        <span class="note">{longueurMessage(texte)} / {MESSAGE_MAX}</span>
      </div>
      {#if emojis}<SelecteurEmojiV2 id="partage-emojis" onchoisir={(e) => void ajouterEmoji(e)} onfermer={() => { emojis = false; boutonEmoji?.focus(); }} />{/if}
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
  .nuancier{display:flex;gap:4px}.nuancier span{width:22px;height:22px;border-radius:4px;border:1px solid var(--v2-line)}
  h2{font-size:20px;margin-top:0}.note{font-size:12px;color:var(--v2-txt2)}form{display:flex;flex-direction:column;gap:8px}.boutons{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  button,textarea,select{font:inherit;border:1px solid var(--v2-line);background:var(--v2-bg);color:inherit;border-radius:6px;padding:8px}button{cursor:pointer}button:disabled{opacity:.5}textarea{resize:vertical;font-family:var(--font-primary,sans-serif),'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'}.ligne-saisie{display:flex;align-items:center;justify-content:space-between;gap:8px}.bouton-emoji{border:0;background:transparent;font-size:22px;line-height:1;padding:4px 6px;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}
</style>
