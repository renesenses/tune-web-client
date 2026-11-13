<script lang="ts">
  /**
   * BIOGRAPHIE et TITRES PHARES d'un artiste — étape 2 de la page artiste
   * commune (renesenses/tune-server-rust#4330).
   *
   * FabienM, 17/09/2026 : « Cette page artiste pourrait être complétée avec la
   * bio de l'artiste, ses titres phares, sa tournée concerts ».
   *
   * Un seul bloc pour les deux fiches — artiste de la bibliothèque
   * (`ArtistesV2`) et artiste de service (`ArtisteServiceV2`) — pour que
   * « la même page » le reste. Chaque fiche fournit ce qu'elle sait : la
   * biographie qu'elle a, les titres qu'un service a rendus. Rien n'est
   * affiché pour ce qui manque.
   *
   * Lire depuis un titre enchaîne la SUITE de la liste affichée, locale ou de
   * service (`lireListe`), comme le best of de la fiche de service.
   */
  import type { Snippet } from 'svelte';
  import type { Track } from '../../lib/types';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { lireListe } from '../../lib/lectureEnMasse';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import * as api from '../../lib/api';
  import ClampedText from '../partages/ClampedText.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import { TITRES_PHARES_MAX } from '../../lib/titresPharesArtiste';
  import AttributionBio from './AttributionBio.svelte';
  import type { BioProvenance } from '../../lib/library/attributionBio';
  import TexteDeBio from './TexteDeBio.svelte';
  import { segmentsAffichables } from '../../lib/library/bioSegments';
  import type { LangueBio } from '../../lib/library/langueBio';
  import MentionRepliBio from './MentionRepliBio.svelte';
  import { CLE_RUBRIQUE_RETIREE, phraseRetrait } from '../../lib/rubriquesRetirees';

  interface Props {
    bio?: string | null;
    /** D'où vient la biographie (`bio_provenance`) — la ligne d'attribution. */
    provenance?: BioProvenance | null;
    /** `bio_segments` du serveur (#7910) : les liens de la biographie. */
    segments?: unknown;
    /** Langue du texte et repli éventuel (`bio_provenance.lang`, `repli`) — #8010. */
    langueBio?: LangueBio | null;
    titres?: Track[];
    /**
     * #1874 — les titres phares sont DEMANDÉS et pas encore là (artiste local :
     * ils viennent des services, après ses albums). Leur bloc est rendu tout de
     * suite, à la hauteur d'une liste pleine (`TITRES_PHARES_MAX` lignes), pour
     * que la discographie, en dessous, ne descende pas quand ils arrivent.
     */
    titresEnCharge?: boolean;
    /** tune-server-rust#8578 — le service a RETIRÉ ses titres phares (Spotify,
     *  applications personnelles) : le nom du service, pour le dire au lieu
     *  d'une section absente. */
    titresRetiresPar?: string | null;
    /** Change à chaque artiste : remet la biographie repliée. */
    cle?: unknown;
    /**
     * Ce qui AGIT sur la biographie, rendu dans son bloc — #1356.
     *
     * Bertrand, 20/09/2026 : « Enrichir la biographie » flottait au milieu de
     * la fiche de bibliothèque, dans une section `.apropos` qui n'a rien à
     * voir avec elle. C'est sur la biographie qu'il agit ; il se lit sous elle.
     *
     * 🔴 Le bloc s'ouvre alors même SANS biographie : c'est le cas où ce
     * bouton sert le plus. Sans cette garde, l'artiste qui n'a pas encore de
     * bio serait justement celui qui ne pourrait pas l'enrichir.
     */
    actionsBio?: Snippet;
  }
  let { bio = null, provenance = null, segments = null, langueBio = null, titres = [], titresEnCharge = false, titresRetiresPar = null, cle = undefined, actionsBio = undefined }: Props = $props();

  const bioPropre = $derived((bio ?? '').trim());
  const segmentsBio = $derived(segmentsAffichables(bioPropre, segments));

  function lireDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null) return;
    void lireListe(titres.slice(i), {
      lire: (c: any) => playAndSync(zid, c),
      enfiler: (c: any) => api.addToQueue(zid, c),
    }).catch(signalerEchecLecture);
  }
</script>

{#if bioPropre || actionsBio}
  <section class="bloc bio-bloc">
    <h2>{$t('v2.art.bio' as any)}</h2>
    {#if bioPropre}
      <ClampedText lines={4} resetKey={cle}
        moreLabel={$t('v2.art.bioReadMore' as any)} lessLabel={$t('v2.art.bioReadLess' as any)}>
        <p class="bio" lang={langueBio?.langue ?? undefined}>{#if segmentsBio}<TexteDeBio segments={segmentsBio} />{:else}{bioPropre}{/if}</p>
      </ClampedText>
      <MentionRepliBio repliVers={langueBio?.repliVers ?? null} />
      <AttributionBio {provenance} />
    {/if}
    {#if actionsBio}
      <div class="bio-actions">{@render actionsBio()}</div>
    {/if}
  </section>
{/if}

{#if titres.length}
  <section class="bloc">
    <h2>{$t('v2.fas.topTracks' as any)}</h2>
    <ListePistesV2 pistes={titres} numerotation="rang" pochetteEnTableau
      onLire={(_p, i) => lireDepuis(i)}
      clef={(p, i) => String((p as any).source ?? 'local') + ':' + String(p.id ?? (p as any).source_id ?? i)} />
  </section>
{:else if titresRetiresPar && !titresEnCharge}
  <section class="bloc" data-rubrique-retiree>
    <h2>{$t('v2.fas.topTracks' as any)}</h2>
    <p class="retiree">{phraseRetrait($t(CLE_RUBRIQUE_RETIREE as any), titresRetiresPar)}</p>
  </section>
{:else if titresEnCharge}
  <!-- #1874 — la place d'une liste pleine, tenue pendant l'attente : même
       titre, même marge, une ligne réservée par titre attendu (46 px, la
       hauteur d'une ligne de `ListePistesV2`, plus son en-tête). -->
  <section class="bloc" data-titres-reserves aria-busy="true">
    <h2>{$t('v2.fas.topTracks' as any)}</h2>
    <div class="reserve" style="--lignes:{TITRES_PHARES_MAX}">
      <span class="attente">{$t('common.loading' as any)}</span>
    </div>
  </section>
{/if}

<style>
  .bloc { margin: 0 0 26px; }
  .retiree { margin: 0; color: var(--v2-txt3); font-size: calc(13px * var(--v2-txt-echelle, 1)); }
  h2 {
    margin: 0 0 10px; font: 600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2);
    text-transform: uppercase; letter-spacing: .05em;
  }
  .bio { margin: 0; font-size: calc(14px * var(--v2-txt-echelle, 1)); line-height: 1.55; color: var(--v2-txt2); white-space: pre-line; max-width: 80ch; }
  /* Sous la biographie, jamais au milieu de la page (#1356). */
  .bio-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  /* #1874 — l'en-tête de `ListePistesV2` (~32 px) puis une ligne de 46 px par
     titre attendu. */
  .reserve {
    min-height: calc(32px + var(--lignes) * 46px);
    display: flex; align-items: flex-start; padding: 12px 10px;
    color: var(--v2-txt3); font: 400 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans);
  }
</style>
