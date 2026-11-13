<script lang="ts">
  /**
   * Le spectrogramme d'une piste de la bibliothèque (tune-server-rust#7857,
   * PR #7897) : une image PNG que le SERVEUR génère à la demande.
   *
   * ## À la demande, avec un état d'attente
   *
   * La génération décode la piste : plusieurs secondes sur un long morceau.
   * Rien ne part donc à l'ouverture du panneau — l'utilisateur appuie sur
   * « Générer le spectrogramme ». Pendant l'attente, un message le dit et la
   * fermeture annule la requête.
   *
   * ## Deux refus, deux phrases
   *
   * « Pas un fichier local » (piste de service, fichier absent) et « l'image
   * n'a pas pu être produite » ne se corrigent pas de la même façon : la
   * seconde se retente, pas la première.
   */
  import { portail } from '../../lib/portail';
  import { t } from '../../lib/i18n';
  import {
    chargerSpectrogramme, ErreurSpectrogramme, type GenreErreurSpectrogramme,
    degradeEchelleDb, graduationsDb, libelleDb, HAUTEUR_SPECTROGRAMME, MARGES_SPECTROGRAMME,
  } from '../../lib/spectrogramme';

  // web#2707 — la zone tracée de l'image, en % de sa hauteur : l'échelle s'y aligne.
  const ECHELLE_HAUT = (MARGES_SPECTROGRAMME.haut / HAUTEUR_SPECTROGRAMME) * 100;
  const ECHELLE_BAS = (MARGES_SPECTROGRAMME.bas / HAUTEUR_SPECTROGRAMME) * 100;
  const GRADUATIONS = graduationsDb();
  const DEGRADE = degradeEchelleDb();

  interface Props {
    trackId: number;
    titre?: string;
    onClose: () => void;
  }
  let { trackId, titre = '', onClose }: Props = $props();

  type Etat =
    | { v: 'repos' }
    | { v: 'chargement' }
    | { v: 'image'; url: string }
    | { v: 'erreur'; genre: GenreErreurSpectrogramme };
  let etat = $state<Etat>({ v: 'repos' });
  let controle: AbortController | null = null;

  function liberer() {
    if (etat.v === 'image') URL.revokeObjectURL(etat.url);
  }

  async function generer() {
    liberer();
    controle?.abort();
    const c = new AbortController();
    controle = c;
    etat = { v: 'chargement' };
    try {
      const blob = await chargerSpectrogramme(trackId, { signal: c.signal });
      if (c.signal.aborted) return;
      etat = { v: 'image', url: URL.createObjectURL(blob) };
    } catch (e) {
      if (c.signal.aborted) return;
      etat = { v: 'erreur', genre: e instanceof ErreurSpectrogramme ? e.genre : 'reseau' };
    }
  }

  function fermer() {
    controle?.abort();
    liberer();
    onClose();
  }

  const CLES_ERREUR: Record<GenreErreurSpectrogramme, string> = {
    'non-locale': 'spectro.notLocal',
    impossible: 'spectro.failed',
    indisponible: 'spectro.unavailable',
    session: 'spectro.session',
    reseau: 'spectro.network',
  };
  /** Un fichier qui n'est pas local ne se « retente » pas. */
  const retentable = $derived(etat.v === 'erreur' && etat.genre !== 'non-locale' && etat.genre !== 'indisponible');

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail
  onclick={(e) => { e.stopPropagation(); fermer(); }}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('spectro.title' as any)} tabindex="-1"
    onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>{$t('spectro.title' as any)}</h2>
      {#if titre}<p class="src">{titre}</p>{/if}
      <button class="x" onclick={fermer} aria-label={$t('v2.common.close' as any)}>×</button>
    </header>

    {#if etat.v === 'repos'}
      <p class="etat">{$t('spectro.intro' as any)}</p>
      <button class="bouton" onclick={generer}>{$t('spectro.generate' as any)}</button>
    {:else if etat.v === 'chargement'}
      <p class="etat" role="status" aria-live="polite">{$t('spectro.loading' as any)}</p>
    {:else if etat.v === 'image'}
      <div class="avec-echelle">
        <img class="image" src={etat.url}
          alt={$t('spectro.alt' as any).replace('{title}', titre)} />
        <!-- web#2707 — l'échelle de couleurs en dBFS, aux couleurs de l'image. -->
        <div class="echelle" role="img" aria-label={$t('spectro.scale' as any)} title={$t('spectro.scale' as any)}
          data-echelle-db style="--haut:{ECHELLE_HAUT}%; --bas:{ECHELLE_BAS}%">
          <div class="zone">
            <span class="barre" style="background:{DEGRADE}"></span>
            {#each GRADUATIONS as g (g.db)}
              <span class="grad" style="bottom:{g.bas}%" data-db={g.db}>{libelleDb(g.db)}</span>
            {/each}
          </div>
          <span class="unite">{$t('spectro.unit' as any)}</span>
        </div>
      </div>
      <p class="etat">{$t('spectro.axes' as any)}</p>
    {:else}
      <p class="etat erreur" role="alert">{$t(CLES_ERREUR[etat.genre] as any)}</p>
      {#if retentable}
        <button class="bouton" onclick={generer}>{$t('spectro.retry' as any)}</button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center;
    background:rgba(0,0,0,.5); padding:20px}
  .panneau{position:relative; width:min(900px, 100%); max-height:min(80vh, 720px); overflow:auto;
    background:var(--v2-surface, var(--tune-surface, #1b1b1f));
    border:1px solid var(--v2-line2, var(--tune-border, #333));
    border-radius:var(--v2-r-card, 12px); padding:18px 20px 20px;
    box-shadow:var(--v2-sh-pop, 0 12px 40px rgba(0,0,0,.5))}
  header{position:relative; padding-right:32px; margin-bottom:14px}
  h2{font:700 calc(16px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); color:var(--v2-txt, var(--tune-text, inherit))}
  .src{margin-top:3px; font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); color:var(--v2-txt3, var(--tune-text-secondary, inherit))}
  .x{position:absolute; top:-4px; right:-6px; width:28px; height:28px; border:0; background:transparent;
    color:var(--v2-txt3, inherit); font-size:calc(20px * var(--v2-txt-echelle, 1)); line-height:1; cursor:pointer; border-radius:6px}
  .x:hover{background:var(--v2-hover, rgba(255,255,255,.06)); color:var(--v2-txt, inherit)}
  .etat{font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); color:var(--v2-txt3, inherit); padding:10px 0}
  .erreur{color:var(--v2-txt, var(--tune-text, inherit))}
  .image{display:block; width:100%; height:auto; border-radius:6px; background:#000}
  .avec-echelle{display:grid; grid-template-columns:minmax(0, 1fr) 58px; gap:8px; align-items:stretch}
  .echelle{position:relative; min-height:120px}
  .zone{position:absolute; left:0; right:0; top:var(--haut); bottom:var(--bas)}
  .barre{position:absolute; left:0; top:0; bottom:0; width:14px; border-radius:3px;
    border:1px solid var(--v2-line2, var(--tune-border, #333))}
  .grad{position:absolute; left:20px; transform:translateY(50%); white-space:nowrap;
    font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono, monospace); color:var(--v2-txt2, var(--tune-text-secondary, inherit));
    font-variant-numeric:tabular-nums}
  .grad::before{content:''; position:absolute; left:-6px; top:50%; width:4px; border-top:1px solid currentColor}
  .unite{position:absolute; left:20px; bottom:0; font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit);
    color:var(--v2-txt3, var(--tune-text-secondary, inherit))}
  .bouton{border:1px solid var(--v2-acc1, var(--tune-accent, currentColor)); background:transparent;
    color:var(--v2-acc1, var(--tune-accent, currentColor)); border-radius:999px; padding:6px 14px;
    font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit); cursor:pointer}
  .bouton:hover{background:var(--v2-hover, rgba(255,255,255,.06))}
  .bouton:focus-visible,.x:focus-visible{outline:2px solid var(--v2-acc1, var(--tune-accent, currentColor)); outline-offset:2px}
</style>
