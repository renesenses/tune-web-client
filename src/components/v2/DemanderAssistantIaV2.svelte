<script lang="ts">
  /**
   * « Demander à l'assistant » — le dialogue de `POST /ai/query`
   * (tune-server-rust#6268) : une question en langage courant sur la
   * bibliothèque locale, la réponse, et sous elle les albums et pistes
   * qu'elle cite, avec « Lire » et « Ajouter » ; les artistes s'ouvrent.
   *
   * Chaque réponse dit son coût (environ : l'écart de dépense du mois) et
   * l'état du plafond ; l'alerte à 80 % est celle des autres usages.
   *
   * La coquille ne monte ce panneau que si l'assistant est prêt
   * (`assistantIaPret`).
   */
  import { t } from '../../lib/i18n';
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
      <textarea bind:value={question} rows="2" maxlength={QUESTION_MAX} autofocus onkeydown={entree}
        placeholder={$t('assistantIa.ask.placeholder' as any)} data-ia-question></textarea>
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
