<script lang="ts">
  /**
   * web#2140 (fil 2202) — l'indicateur « règle de réaffectation des canaux
   * armée », sur la fiche album et sur les cartes de la page Zones.
   *
   * La règle ne se voyait que dans son propre écran (Greffons → Réaffectation
   * des canaux). Ce badge la signale là où l'on regarde : l'album, la zone.
   *
   * Lecture seule. La décision « armée » est `regleArmee` (miroir de la règle
   * du serveur) ; l'infobulle dit ce qu'« armée » veut dire : la règle ne
   * s'applique qu'aux pistes du bon nombre de canaux, et celle de l'album prime.
   * Aucune réponse (greffon absent, serveur ancien, erreur) : aucun badge — on
   * ne signale que ce qu'on a lu.
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import {
    getReaffectationAlbum, getReaffectationZone, regleArmee, type RegleArmee,
  } from '../../lib/reaffectationCanaux';

  interface Props {
    cible: 'zone' | 'album';
    id: number | null | undefined;
  }
  let { cible, id }: Props = $props();

  let regle = $state<RegleArmee | null>(null);
  let generation = 0;
  onDestroy(() => { generation += 1; });

  $effect(() => {
    const ident = id;
    const c = cible;
    const g = ++generation;
    regle = null;
    if (ident == null) return;
    const lire = c === 'album' ? getReaffectationAlbum : getReaffectationZone;
    lire(ident)
      .then((e) => { if (g === generation) regle = regleArmee(e); })
      .catch(() => { if (g === generation) regle = null; });
  });

  const texte = $derived(
    regle ? $t('v2.cr.badge' as any).replace('{in}', String(regle.entrees)).replace('{out}', String(regle.sorties)) : '',
  );
  const infobulle = $derived(
    regle
      ? $t((cible === 'album' ? 'v2.cr.badgeAlbumTip' : 'v2.cr.badgeZoneTip') as any).replace('{in}', String(regle.entrees))
      : '',
  );
</script>

{#if regle}
  <span class="reaff {cible}" data-reaffectation={cible} title={infobulle}>{texte}</span>
{/if}

<style>
  /* Sur la fiche album : la forme des étiquettes `.qbadge.cue` de la ligne. */
  .reaff.album{font:700 11px var(--v2-mono); letter-spacing:.04em; padding:6px 10px; border-radius:8px;
    background:transparent; border:1px solid var(--v2-acc2); color:var(--v2-acc-tint); white-space:nowrap}
  /* Sur une carte de zone : la pastille `.rc.warn` de ZonesV2. */
  .reaff.zone{font:10px var(--v2-mono); padding:2px 8px; border-radius:999px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); white-space:nowrap}
</style>
