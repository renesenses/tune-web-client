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
  import type { Track } from '../../lib/types';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { lireListe } from '../../lib/lectureEnMasse';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import * as api from '../../lib/api';
  import ClampedText from '../partages/ClampedText.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';

  interface Props {
    bio?: string | null;
    titres?: Track[];
    /** Change à chaque artiste : remet la biographie repliée. */
    cle?: unknown;
  }
  let { bio = null, titres = [], cle = undefined }: Props = $props();

  const bioPropre = $derived((bio ?? '').trim());

  function lireDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null) return;
    void lireListe(titres.slice(i), {
      lire: (c: any) => playAndSync(zid, c),
      enfiler: (c: any) => api.addToQueue(zid, c),
    }).catch(signalerEchecLecture);
  }
</script>

{#if bioPropre}
  <section class="bloc">
    <h2>{$t('v2.art.bio' as any)}</h2>
    <ClampedText lines={4} resetKey={cle}>
      <p class="bio">{bioPropre}</p>
    </ClampedText>
  </section>
{/if}

{#if titres.length}
  <section class="bloc">
    <h2>{$t('v2.fas.topTracks' as any)}</h2>
    <ListePistesV2 pistes={titres} numerotation="rang" pochetteEnTableau
      onLire={(_p, i) => lireDepuis(i)}
      clef={(p, i) => String((p as any).source ?? 'local') + ':' + String(p.id ?? (p as any).source_id ?? i)} />
  </section>
{/if}

<style>
  .bloc { margin: 0 0 26px; }
  h2 {
    margin: 0 0 10px; font: 600 13px var(--v2-sans); color: var(--v2-txt2);
    text-transform: uppercase; letter-spacing: .05em;
  }
  .bio { margin: 0; font-size: 14px; line-height: 1.55; color: var(--v2-txt2); white-space: pre-line; max-width: 80ch; }
</style>
