<script lang="ts">
  /**
   * La REQUÊTE AVANCÉE de la Bibliothèque (tune-server-rust#7872), ouverte
   * depuis le champ de recherche de la Bibliothèque.
   *
   * `GET /library/query` rend les pistes page par page, sous la forme de
   * `/library/tracks` : elles passent donc par `ListePistesV2`, le tableau de
   * toutes les autres listes de pistes. Une requête mal formée rend 400 : la
   * saisie partagée (`SaisieRequeteV2`) montre où.
   */
  import { untrack } from 'svelte';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import { chercherParRequete, type ErreurDeRequete } from '../../lib/requeteAvancee';
  import { playAndSync } from '../../lib/stores/zones';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { gestesDeZone } from '../../lib/gestesDeZone';
  import { lireListeDepuis } from '../../lib/lectureEnMasse';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import type { Track } from '../../lib/types';
  import SaisieRequeteV2 from './SaisieRequeteV2.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import '../../styles/tune-v2.css';

  interface Props {
    /** Le texte de départ : celui du champ de recherche, s'il y en a un. */
    initiale?: string;
    onClose: () => void;
  }
  let { initiale = '', onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let saisie = $state(initiale);
  let erreur = $state<ErreurDeRequete | null>(null);
  let pistes = $state<Track[]>([]);
  let total = $state<number | null>(null);
  let encore = $state(false);
  let enCours = $state(false);
  let echec = $state(false);
  /** La requête des pages affichées : « Plus » la reprend, pas la saisie. */
  let requeteAffichee = '';
  let seq = 0;

  async function chercher(suite = false) {
    const q = suite ? requeteAffichee : saisie.trim();
    if (!q || enCours && suite) return;
    const mien = ++seq;
    enCours = true;
    echec = false;
    try {
      const r = await chercherParRequete(q, suite ? pistes.length : 0);
      if (mien !== seq) return;
      if (!r.ok) {
        erreur = r.erreur;
        return;
      }
      erreur = null;
      requeteAffichee = q;
      pistes = suite ? [...pistes, ...r.page.items] : r.page.items;
      total = r.page.total;
      encore = r.page.hasMore;
    } catch {
      if (mien === seq) echec = true;
    } finally {
      if (mien === seq) enCours = false;
    }
  }

  // Une saisie de départ se cherche tout de suite, UNE fois : sans
  // `untrack`, l'effet suivrait `saisie` et `enCours`, que `chercher` lit, et
  // relancerait la première page à chaque frappe et à chaque « Plus ».
  $effect(() => {
    if (initiale.trim()) untrack(() => void chercher());
  });

  function lire(p: Track) {
    const zid = zoneRequise();
    if (zid == null || p.id == null) return;
    playAndSync(zid, { track_id: p.id }).catch(signalerEchecLecture);
  }
  function lireDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null) return;
    lireListeDepuis(pistes as any, i, gestesDeZone(zid)).catch(signalerEchecLecture);
  }
</script>

<div class="v2-reqav tune-v2">
  <div class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('requeteAvancee.eyebrow' as any)}</div>
      <h1>{$t('requeteAvancee.title' as any)}</h1>
    </div>
    <button class="fermer" onclick={onClose} aria-label={$t('common.close' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>

  <div class="corps">
    <div class="recherche">
      <SaisieRequeteV2 bind:value={saisie} {erreur} onSubmit={() => void chercher()} autofocus />
      <button class="play" onclick={() => void chercher()} disabled={!saisie.trim() || enCours}>
        {$t('requeteAvancee.run' as any)}
      </button>
    </div>

    {#if echec}
      <p class="etat">{$t('common.error' as any)}</p>
    {:else if total != null}
      <p class="etat">
        {#if total === 1}{$t('requeteAvancee.countOne' as any)}{:else}{$t('requeteAvancee.count' as any).replace('{n}', $formatNombre(total))}{/if}
      </p>
    {/if}

    {#if pistes.length}
      <div class="liste">
        <ListePistesV2 pistes={pistes as any} numerotation="aucune" pochetteEnTableau
          onLire={(p) => lire(p as any)}
          onLireDepuis={(_p, i) => lireDepuis(i)} />
      </div>
      {#if encore}
        <button class="ghost" onclick={() => void chercher(true)} disabled={enCours}>
          {$t('requeteAvancee.more' as any)}
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .v2-reqav{position:absolute; inset:0; z-index:40; display:flex; flex-direction:column;
    background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .fermer{margin-left:auto; width:36px; height:36px; border-radius:10px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2);
    display:grid; place-items:center}
  .fermer:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .fermer svg{width:16px; height:16px}
  .corps{flex:1; min-height:0; overflow-y:auto; padding:6px 30px 20px; display:flex;
    flex-direction:column; gap:14px}
  .recherche{display:flex; gap:10px; align-items:flex-start; max-width:900px}
  .recherche > :global(.v2-req){flex:1}
  .etat{margin:0; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .liste{min-width:0}
  .ghost,.play{height:40px; padding:0 20px; border-radius:var(--v2-r-pill); font:700 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor:pointer; flex:none}
  .ghost{align-self:center; color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .play{color:var(--v2-on-acc); border:0; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .play:disabled,.ghost:disabled{opacity:.45; cursor:default}
</style>
