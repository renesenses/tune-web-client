<script lang="ts">
  /**
   * tune-server-rust#8077 — « Compléments Qobuz » de la fiche d'un album de
   * la BIBLIOTHÈQUE : ce que Qobuz a complété sans rien écraser (label, date,
   * UPC, ℗ et ©, genres, récompenses, hi-res, livret, pochette HD, crédits),
   * chaque ligne avec sa source. Un rapprochement douteux se confirme ; tous
   * les apports se retirent d'un geste.
   *
   * Rien ne s'affiche tant qu'il n'y a ni apport ni confirmation à proposer :
   * un album jamais retrouvé chez Qobuz garde sa fiche telle quelle.
   *
   * web#2837 (Didier, fil 2768) — la zone se replie à son seul titre par un
   * triangle. L'état replié est une préférence d'AFFICHAGE retenue d'un album
   * à l'autre (`preferencesEcran`) : on ne replie pas chaque fiche.
   *
   * web#3123 (FabienM, fil 2864) — le contenu passe en SOUS-ONGLETS : Label
   * (l'édition), Détails, Crédits (`ongletsApports`). Un onglet vide n'existe
   * pas ; seul, il n'affiche pas de rangée d'onglets. La forme reprend celle
   * des onglets de la fiche (maquette de Levente, Pistes | Crédits | …), en
   * plus petit. La place de la section dans la fiche ne change pas.
   *
   * 🔄 Fil forum 3009 (FabienM, point 11 ; go du 23/11/2026) — la fiche album
   * la range dans un ONGLET « Compléments Qobuz », à côté de « Crédits »
   * (`enOnglet`) : l'onglet nomme déjà la section, le titre repliable
   * disparaît. `onPresence` dit à la fiche s'il y a quelque chose à montrer,
   * pour que l'onglet n'existe pas sur un album jamais retrouvé chez Qobuz.
   */
  import { tick } from 'svelte';
  import { t as tr } from '../../lib/i18n';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import * as api from '../../lib/api';
  import {
    confirmable,
    creditsQobuz,
    lignesApports,
    cleDuRefus,
    retirable,
    ongletsApports,
    LIBELLES_ONGLETS_APPORTS,
    type ApportsQobuz,
    type OngletApports,
  } from '../../lib/apportsQobuz';

  interface Props {
    albumId: number;
    /** Fil 3009 — rendu dans un onglet de la fiche : ni titre, ni repli. */
    enOnglet?: boolean;
    /** Fil 3009 — appelé quand la section a (ou n'a plus) quelque chose à montrer. */
    onPresence?: ((presente: boolean) => void) | null;
  }
  let { albumId, enOnglet = false, onPresence = null }: Props = $props();

  let apports = $state.raw<ApportsQobuz | null>(null);
  let credits = $state.raw<ReturnType<typeof creditsQobuz>>([]);
  let enCours = $state(false);
  let erreur = $state<string | null>(null);
  let retire = $state(false);

  /** web#2837 — `'oui'` : la zone est repliée à son titre. */
  const CLE_REPLI = 'v2.album.qobuz.replie';
  let replie = $state(lireChoix(CLE_REPLI, ['oui', 'non'] as const, 'non') === 'oui');
  function basculerRepli() {
    replie = !replie;
    ecrireChoix(CLE_REPLI, replie ? 'oui' : 'non');
  }

  async function charger(id: number) {
    const a = await api.getApportsQobuz(id).catch(() => null);
    if (id !== albumId) return;
    apports = a;
    credits = a?.statut === 'applique'
      ? creditsQobuz(await api.getAlbumCredits(id).catch(() => []) as any)
      : [];
  }

  $effect(() => {
    apports = null;
    credits = [];
    retire = false;
    erreur = null;
    void charger(albumId);
  });

  const lignes = $derived(lignesApports(apports));
  /** Ce qui décide d'afficher la section — et, dans la fiche, son onglet. */
  const presente = $derived(!!(lignes.length || credits.length || confirmable(apports) || retire));
  $effect(() => { onPresence?.(presente); });

  /** web#3123 — les sous-onglets présents, et celui qui est ouvert. */
  const onglets = $derived(ongletsApports(lignes, credits.length));
  let ongletDemande = $state<OngletApports>('label');
  const onglet = $derived<OngletApports | null>(
    onglets.includes(ongletDemande) ? ongletDemande : (onglets[0] ?? null),
  );
  const lignesOnglet = $derived(lignes.filter((l) => l.onglet === onglet));
  $effect(() => { void albumId; ongletDemande = 'label'; });
  /** ← / → / Début / Fin d'un onglet à l'autre (motif « tabs » de l'ARIA APG). */
  function clavierOnglets(e: KeyboardEvent) {
    if (!onglet) return;
    const i = onglets.indexOf(onglet);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % onglets.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + onglets.length) % onglets.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = onglets.length - 1;
    if (j < 0) return;
    e.preventDefault();
    ongletDemande = onglets[j];
    void tick().then(() => document.getElementById(`apports-qobuz-onglet-${albumId}-${onglets[j]}`)?.focus());
  }

  async function retirer() {
    enCours = true;
    erreur = null;
    try {
      await api.retirerApportsQobuz(albumId);
      retire = true;
      await charger(albumId);
    } catch (e) {
      const cle = cleDuRefus(e);
      erreur = cle ? $tr(cle as any) : e instanceof Error ? e.message : String(e);
    } finally {
      enCours = false;
    }
  }

  async function confirmer() {
    const id = apports?.service_album_id;
    if (!id) return;
    enCours = true;
    erreur = null;
    try {
      await api.confirmerApportsQobuz(albumId, id);
      await charger(albumId);
    } catch (e) {
      const cle = cleDuRefus(e);
      erreur = cle ? $tr(cle as any) : e instanceof Error ? e.message : String(e);
    } finally {
      enCours = false;
    }
  }
</script>

{#if presente}
  <section class="apports-qobuz" class:en-onglet={enOnglet} data-apports-qobuz
    aria-labelledby={enOnglet ? undefined : `apports-qobuz-titre-${albumId}`}
    aria-label={enOnglet ? $tr('v2.album.qobuz.title' as any) : undefined}>
    {#if !enOnglet}
    <h3 id="apports-qobuz-titre-{albumId}" class:replie>
      <!-- Motif « disclosure » : le nom du bouton reste le TITRE, l'état est
           porté par `aria-expanded` ; « Replier »/« Déplier » est l'infobulle. -->
      <button class="pli" type="button" data-replier-qobuz onclick={basculerRepli}
        aria-expanded={!replie} aria-controls="apports-qobuz-corps-{albumId}"
        title={replie ? $tr('v2.album.qobuz.expand' as any) : $tr('v2.album.qobuz.collapse' as any)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" class:ferme={replie}><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        <span>{$tr('v2.album.qobuz.title' as any)}</span>
      </button>
    </h3>
    {/if}
    <div class="corps" id="apports-qobuz-corps-{albumId}" hidden={!enOnglet && replie}>
    {#if confirmable(apports)}
      <p class="a-confirmer">{$tr('v2.album.qobuz.toConfirm' as any)}</p>
      <div class="gestes">
        <button class="v2-btn" data-confirmer-qobuz onclick={confirmer} disabled={enCours}>
          {$tr('v2.album.qobuz.confirm' as any)}
        </button>
        {#if apports?.service_url}
          <a class="v2-btn" href={apports.service_url} target="_blank" rel="noopener noreferrer">
            {$tr('v2.album.qobuz.openOnQobuz' as any)}
          </a>
        {/if}
      </div>
    {/if}
    {#if onglets.length > 1}
      <div class="onglets" role="tablist" aria-label={$tr('v2.album.qobuz.title' as any)} data-onglets-qobuz>
        {#each onglets as o (o)}
          <button type="button" role="tab" class="onglet" class:actif={onglet === o}
            id="apports-qobuz-onglet-{albumId}-{o}" aria-controls="apports-qobuz-panneau-{albumId}"
            aria-selected={onglet === o} tabindex={onglet === o ? 0 : -1}
            data-onglet-qobuz={o}
            onclick={() => (ongletDemande = o)} onkeydown={clavierOnglets}>{$tr(LIBELLES_ONGLETS_APPORTS[o] as any)}</button>
        {/each}
      </div>
    {/if}
    {#if onglet}
      <div class="panneau" id="apports-qobuz-panneau-{albumId}" data-panneau-qobuz={onglet}
        role={onglets.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={onglets.length > 1 ? `apports-qobuz-onglet-${albumId}-${onglet}` : undefined}
        tabindex={onglets.length > 1 ? 0 : undefined}>
      {#if onglet === 'credits'}
        <!-- Seuls, les crédits n'ont pas d'onglet qui les nomme : leur titre
             reste visible, comme avant les sous-onglets. -->
        {#if onglets.length === 1}<h4>{$tr('v2.album.qobuz.credits' as any)}</h4>{/if}
        <ul class="credits" aria-label={$tr('v2.album.qobuz.credits' as any)}>
          {#each credits as c (c.nom + c.role)}
            <li>
              {c.nom}{c.role ? ` — ${c.role}` : ''}{c.pistes.length ? ` (${c.pistes.join(', ')})` : ''}
              <span class="source" data-source="qobuz">{$tr('v2.album.qobuz.source' as any)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <dl>
          {#each lignesOnglet as l, i (i)}
            <div class="ligne">
              {#if l.cle}<dt>{$tr(l.cle as any)}</dt>{/if}
              <dd>
                {#if l.url}
                  <a href={l.url} target="_blank" rel="noopener noreferrer">{l.texte || $tr(l.cle as any)}</a>
                {:else}
                  {l.texte}
                {/if}
                <span class="source" data-source={l.source}>{$tr('v2.album.qobuz.source' as any)}</span>
              </dd>
            </div>
          {/each}
        </dl>
      {/if}
      </div>
    {/if}
    {#if retirable(apports)}
      <button class="v2-btn" data-retirer-qobuz onclick={retirer} disabled={enCours}>
        {$tr('v2.album.qobuz.remove' as any)}
      </button>
    {:else if retire}
      <p role="status">{$tr('v2.album.qobuz.removed' as any)}</p>
    {/if}
    </div>
    {#if erreur}<p role="alert">{erreur}</p>{/if}
  </section>
{/if}

<style>
  .apports-qobuz { margin: 1rem 0; padding: .75rem 1rem; border: 1px solid var(--tune-border, rgba(127,127,127,.25)); border-radius: 8px; }
  /* Fil 3009 — dans l'onglet de la fiche, la rangée d'onglets la sépare déjà de l'en-tête. */
  .apports-qobuz.en-onglet { margin-top: 0; }
  h3 { margin: 0 0 .5rem; font-size: calc(1rem * var(--v2-txt-echelle, 1)); display: flex; align-items: center; gap: .25rem; }
  h3.replie { margin-bottom: 0; }
  .pli { display: inline-flex; align-items: center; gap: .25rem; padding: 0; margin-left: -.25rem; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; border-radius: 4px; text-align: left; }
  .pli svg { width: 1rem; height: 1rem; transition: transform .15s; }
  .pli svg.ferme { transform: rotate(-90deg); }
  /* web#3123 — sous-onglets : la forme des onglets de la fiche (`.onglet`
     d'`AlbumDetailV2`, maquette de Levente), en plus petit. Au téléphone, la
     rangée défile plutôt que de pousser la fiche hors du cadre. */
  .onglets { display: flex; gap: 2px; margin: 0 0 .5rem; border-bottom: 1px solid var(--v2-line2, rgba(127,127,127,.25));
    overflow-x: auto; scrollbar-width: none; }
  .onglet { flex: 0 0 auto; padding: 6px 10px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px;
    background: transparent; color: var(--v2-txt2, inherit); font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit);
    cursor: pointer; white-space: nowrap; }
  .onglet:hover { color: var(--v2-txt, inherit); }
  .onglet.actif { color: var(--v2-txt, inherit); border-bottom-color: var(--v2-acc2, currentColor); }
  .onglet:focus-visible { outline: 2px solid var(--v2-acc2, currentColor); outline-offset: -2px; }
  .panneau { margin: 0 0 .5rem; }
  .panneau:focus-visible { outline: 2px solid var(--v2-acc2, currentColor); outline-offset: 2px; border-radius: 4px; }
  h4 { margin: .25rem 0 .25rem; font-size: calc(.9rem * var(--v2-txt-echelle, 1)); }
  dl { margin: 0; display: grid; gap: .25rem; }
  .ligne { display: flex; gap: .5rem; flex-wrap: wrap; }
  dt { font-weight: 600; min-width: 9rem; }
  dd { margin: 0; }
  .credits { margin: 0; padding-left: 1.2rem; }
  .source { margin-left: .4rem; font-size: calc(.75rem * var(--v2-txt-echelle, 1)); opacity: .7; }
  .gestes { display: flex; gap: .5rem; margin: .25rem 0 .5rem; flex-wrap: wrap; }
  .a-confirmer { margin: 0 0 .25rem; }
  /* Recette du .18 (15/11) : les gestes portaient `ghost`, une classe que
     seule la fiche habille — ici, sans style. Ils prennent LE bouton
     partagé (`.v2-btn`, tune-v2.css) ; le lien vers Qobuz aussi. */
  a.v2-btn { text-decoration: none; }
  dd a { color: var(--v2-acc-tint); text-decoration: underline; text-underline-offset: 2px; }
  dd a:hover { color: var(--v2-txt); }
  dd a:focus-visible { outline: 2px solid var(--v2-acc2); outline-offset: 2px; border-radius: 3px; }
</style>
