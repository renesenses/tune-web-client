<script lang="ts">
  /**
   * « Demander à l'assistant » — le dialogue de `POST /ai/query`
   * (tune-server-rust#6268) : une question en langage courant sur la
   * bibliothèque locale, la réponse, et sous elle les albums et pistes
   * qu'elle cite, avec « Lire » et « Ajouter » ; les artistes s'ouvrent.
   *
   * Chaque réponse dit son coût exact (`cout_eur` du serveur ; rien face à
   * un serveur antérieur) et l'état du plafond ; l'alerte à 80 % est celle
   * des autres usages.
   *
   * La coquille ne monte ce panneau que si l'assistant est prêt
   * (`assistantIaPret`).
   */
  import { t, locale } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { currentZone } from '../../lib/stores/zones';
  import { activeView, pendingLibraryAlbum } from '../../lib/stores/navigation';
  import { ouvrirFicheArtisteLocale } from '../../lib/ouvrirArtisteDepuis';
  import { notifications } from '../../lib/stores/notifications';
  import { cleDEchec } from '../../lib/assistantIa';
  import {
    conversationIa, poserQuestionIa, oublierConversationIa, dernierPlafond, aucuneCitation,
    lireCitation, ajouterCitation, texteCout, textePlafond, QUESTION_MAX, type GenreCite,
  } from '../../lib/assistantIaDialogue';
  import AlertePlafondIaV2 from './AlertePlafondIaV2.svelte';
  import {
    voixActivee, relireAvantEnvoi, demarrerDictee, CLE_ECHEC, type Dictee,
  } from '../../lib/commandeVocale';

  let { onClose }: { onClose: () => void } = $props();

  let question = $state('');
  const occupe = $derived($conversationIa.some((tour) => tour.enCours));
  const plafond = $derived(dernierPlafond($conversationIa));
  const zoneId = $derived<number | null>($currentZone?.id ?? null);

  const traduire = (code: string) => $t(cleDEchec(code) as any);

  async function poser(e?: Event) {
    e?.preventDefault();
    const q = question.trim();
    if (!q || occupe) return;
    question = '';
    await poserQuestionIa(q, zoneId, traduire);
  }

  async function lire(genre: GenreCite, id: number) {
    if (zoneId == null) { notifications.error($t('assistantIa.ask.noZone' as any)); return; }
    try { await lireCitation(genre, id, zoneId); } catch { /* fetchJSON a déjà dit l'échec */ }
  }

  async function ajouter(genre: GenreCite, id: number, titre: string) {
    if (zoneId == null) { notifications.error($t('assistantIa.ask.noZone' as any)); return; }
    try {
      await ajouterCitation(genre, id, zoneId);
      notifications.success($t('assistantIa.ask.added' as any).replace('{titre}', titre));
    } catch { /* idem */ }
  }

  function ouvrirAlbum(id: number) {
    pendingLibraryAlbum.set(id);
    activeView.set('library');
    onClose();
  }

  function ouvrirArtiste(id: number, nom: string) {
    ouvrirFicheArtisteLocale(id, nom, $activeView);
    onClose();
  }

  // ── Commande vocale (Réglages › Tune Voice AI) ────────────────────────
  // Le bouton micro n'apparaît que si l'utilisateur l'a activée. Un appui
  // démarre la dictée : le texte reconnu s'écrit en direct dans le champ, et
  // la fin de la parole envoie la question — sauf « Relire avant l'envoi ».
  const voix = voixActivee();
  const relire = relireAvantEnvoi();
  let dictee = $state<Dictee | null>(null);
  let echecVoix = $state('');
  let champ = $state<HTMLTextAreaElement | null>(null);

  function micro() {
    if (dictee) { dictee.arreter(); return; }
    echecVoix = '';
    dictee = demarrerDictee($locale, {
      texte: (txt) => { question = txt; },
      fin: (txt) => {
        dictee = null;
        question = txt;
        // Une question déjà en route : le texte attend dans le champ.
        if (relire || occupe) champ?.focus();
        else void poser();
      },
      echec: (e) => {
        dictee = null;
        echecVoix = $t(CLE_ECHEC[e] as any);
      },
    });
  }

  // Fermer le panneau en pleine dictée l'annule. `dictee` est un $state, et
  // Svelte ne le relit pas de façon fiable au démontage : on lit la
  // reconnaissance par une référence ordinaire.
  $effect(() => {
    const d = dictee;
    return () => d?.annuler();
  });

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function entree(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void poser(); }
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('assistantIa.ask.title' as any)}
    onclick={(e) => e.stopPropagation()} data-demander-assistant>
    <h2>{$t('assistantIa.ask.title' as any)}</h2>
    <button class="fermer" aria-label={$t('assistantIa.close' as any)} onclick={onClose}>×</button>
    <p class="note">{$t('assistantIa.ask.intro' as any)}</p>

    {#if $conversationIa.length}
      <ol class="tours" aria-live="polite">
        {#each $conversationIa as tour (tour.id)}
          <li class="tour" data-ia-tour>
            <p class="q">{tour.question}</p>
            {#if tour.enCours}
              <p class="note">{$t('assistantIa.ask.thinking' as any)}</p>
            {:else if tour.erreur}
              <p class="err" role="alert" data-ia-erreur>{tour.erreur}</p>
            {:else}
              <p class="r" data-ia-reponse>{tour.reponse}</p>
              {#if !aucuneCitation(tour.citations)}
                <ul class="cites">
                  {#each tour.citations.albums as a (`a${a.id}`)}
                    <li data-ia-cite-album={a.id}>
                      <button class="lien" onclick={() => ouvrirAlbum(a.id)}>{a.title}</button>
                      {#if a.artist}<span class="sec-txt">— {a.artist}</span>{/if}
                      <span class="actions">
                        <button class="mini" onclick={() => lire('album', a.id)} data-ia-lire>{$t('assistantIa.ask.play' as any)}</button>
                        <button class="mini" onclick={() => ajouter('album', a.id, a.title)} data-ia-ajouter>{$t('assistantIa.ask.add' as any)}</button>
                      </span>
                    </li>
                  {/each}
                  {#each tour.citations.pistes as p (`p${p.id}`)}
                    <li data-ia-cite-piste={p.id}>
                      <span>♪ {p.title}</span>
                      {#if p.artist}<span class="sec-txt">— {p.artist}</span>{/if}
                      <span class="actions">
                        <button class="mini" onclick={() => lire('piste', p.id)} data-ia-lire>{$t('assistantIa.ask.play' as any)}</button>
                        <button class="mini" onclick={() => ajouter('piste', p.id, p.title)} data-ia-ajouter>{$t('assistantIa.ask.add' as any)}</button>
                      </span>
                    </li>
                  {/each}
                  {#each tour.citations.artistes as ar (`r${ar.id}`)}
                    <li data-ia-cite-artiste={ar.id}>
                      <button class="lien" onclick={() => ouvrirArtiste(ar.id, ar.name)}>{ar.name}</button>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
            {#if !tour.enCours}
              {@const cout = texteCout($t('assistantIa.ask.cost' as any), tour.cout_eur)}
              {#if cout}<p class="note" data-ia-cout>{cout}</p>{/if}
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    {#if plafond}
      <p class="note" data-ia-plafond>{textePlafond($t('assistantIa.ask.cap' as any), plafond)}</p>
      <AlertePlafondIaV2 {plafond} />
    {/if}

    <form onsubmit={poser}>
      <!-- svelte-ignore a11y_autofocus -->
      <div class="saisie">
        <textarea bind:this={champ} bind:value={question} rows="2" maxlength={QUESTION_MAX} autofocus onkeydown={entree}
          placeholder={$t('assistantIa.ask.placeholder' as any)} data-ia-question></textarea>
        {#if voix}
          <button type="button" class="micro" class:actif={dictee !== null} disabled={occupe}
            aria-pressed={dictee !== null}
            aria-label={$t((dictee ? 'voice.stop' : 'voice.start') as any)}
            title={$t((dictee ? 'voice.stop' : 'voice.start') as any)}
            onclick={micro} data-ia-micro>
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
          </button>
        {/if}
      </div>
      {#if dictee}
        <p class="note ecoute" aria-live="polite" data-ia-ecoute>{$t((relire ? 'voice.listeningReview' : 'voice.listening') as any)}</p>
      {/if}
      {#if echecVoix}
        <p class="err" role="alert" data-ia-echec-voix>{echecVoix}</p>
      {/if}
      <div class="pied">
        {#if $conversationIa.length}
          <button type="button" class="sec" disabled={occupe} onclick={oublierConversationIa}>{$t('assistantIa.ask.new' as any)}</button>
        {/if}
        <button type="submit" class="pri" disabled={occupe || !question.trim()}>{$t('assistantIa.ask.send' as any)}</button>
      </div>
    </form>
  </div>
</div>

<style>
  .fond {
    position: fixed; inset: 0; z-index: 900; display: grid; place-items: center;
    background: rgba(0, 0, 0, 0.55); padding: 16px;
  }
  .panneau {
    position: relative; width: min(620px, 100%); max-height: 90vh; overflow: auto; box-sizing: border-box;
    background: var(--v2-surface); color: var(--v2-txt);
    border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card);
    padding: 20px 22px 22px; font-family: var(--v2-sans);
  }
  h2 { font-size: 17px; font-weight: 700; margin: 0 0 8px; padding-right: 32px; }
  .fermer {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
    border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3);
    font-size: 20px; line-height: 1; cursor: pointer;
  }
  .fermer:hover { background: var(--v2-surface2); color: var(--v2-txt); }
  .note { font-size: 12.5px; color: var(--v2-txt3); margin: 4px 0; }
  .err { font-size: 13px; color: var(--v2-danger); margin: 4px 0; }
  .tours { list-style: none; padding: 0; margin: 12px 0; display: grid; gap: 14px; }
  .tour { border-top: 1px solid var(--v2-line2); padding-top: 10px; }
  .q { font-weight: 600; margin: 0 0 6px; white-space: pre-wrap; }
  .r { margin: 0 0 6px; white-space: pre-wrap; line-height: 1.45; }
  .cites { list-style: none; padding: 0; margin: 6px 0; display: grid; gap: 4px; font-size: 13px; }
  .cites li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sec-txt { color: var(--v2-txt3); }
  .actions { display: inline-flex; gap: 4px; margin-left: auto; }
  .lien {
    border: 0; background: none; padding: 0; color: var(--v2-acc1);
    font: inherit; cursor: pointer; text-decoration: underline; text-align: left;
  }
  .mini {
    border: 1px solid var(--v2-line2); border-radius: 6px; background: var(--v2-surface2);
    color: var(--v2-txt); font-size: 12px; padding: 2px 8px; cursor: pointer;
  }
  .saisie { display: flex; align-items: stretch; gap: 10px; margin-top: 10px; }
  .saisie textarea { margin-top: 0; flex: 1; }
  /* Gros et franc : la commande vocale sert d'abord à qui tape mal. */
  .micro {
    flex: none; width: 64px; min-height: 64px; border-radius: 14px; cursor: pointer;
    border: 2px solid var(--v2-acc1); background: transparent; color: var(--v2-acc1);
    display: grid; place-items: center;
  }
  .micro:hover { background: var(--v2-surface2); }
  .micro.actif { background: var(--v2-acc1); color: var(--v2-on-acc); animation: pouls 1.2s ease-in-out infinite; }
  .micro:disabled { opacity: 0.5; cursor: default; }
  .micro:focus-visible { outline: 3px solid var(--v2-acc1); outline-offset: 2px; }
  @keyframes pouls { 50% { opacity: 0.75; } }
  @media (prefers-reduced-motion: reduce) { .micro.actif { animation: none; } }
  .ecoute { color: var(--v2-acc1); font-weight: 600; }
  textarea {
    width: 100%; box-sizing: border-box; background: var(--v2-bg); margin-top: 10px;
    border: 1px solid var(--v2-line2); border-radius: 8px; color: var(--v2-txt);
    padding: 8px 10px; font: inherit;
  }
  .pied { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
  .pri, .sec { border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
  .pri { border: 1px solid var(--v2-acc1); background: transparent; color: var(--v2-acc1); }
  .sec { border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt); }
  .pri:disabled, .sec:disabled { opacity: 0.5; cursor: default; }
</style>
