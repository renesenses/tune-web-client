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
   *
   * tune-server-rust#9179 — seule une sortie LOCALE applique la matrice. Le
   * serveur le dit sur la route d'une zone (`applies_to_output`) : `false`
   * pour un lecteur réseau (DLNA, AirPlay, OAAT…). Le badge se nuance alors
   * (« non appliquée ») : sur une carte de zone, d'après CETTE zone ; sur la
   * fiche album, d'après la zone EN COURS. `true` ou `null` (sortie inconnue,
   * serveur ancien) : badge inchangé.
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import { currentZoneId } from '../../lib/stores/zones';
  import {
    getReaffectationAlbum, getReaffectationZone, regleArmee, type RegleArmee,
  } from '../../lib/reaffectationCanaux';

  interface Props {
    cible: 'zone' | 'album';
    id: number | null | undefined;
  }
  let { cible, id }: Props = $props();

  let regle = $state<RegleArmee | null>(null);
  /** #9179 — `false` : la sortie de la zone concernée n'applique pas la règle. */
  let appliquee = $state<boolean | null>(null);
  let generation = 0;
  let generationZone = 0;
  onDestroy(() => { generation += 1; generationZone += 1; });

  $effect(() => {
    const ident = id;
    const c = cible;
    const g = ++generation;
    regle = null;
    if (ident == null) return;
    const lire = c === 'album' ? getReaffectationAlbum : getReaffectationZone;
    lire(ident)
      .then((e) => {
        if (g !== generation) return;
        regle = regleArmee(e);
        // Une zone dit d'elle-même si sa sortie applique la règle.
        if (c === 'zone') appliquee = e?.applies_to_output ?? null;
      })
      .catch(() => { if (g === generation) regle = null; });
  });

  // #9179 — fiche album : la règle s'applique-t-elle dans la zone EN COURS ?
  // Lu seulement quand la règle est armée : aucun appel de plus sinon.
  $effect(() => {
    if (cible !== 'album') return;
    const zone = $currentZoneId;
    const armee = regle != null;
    const g = ++generationZone;
    appliquee = null;
    if (!armee || zone == null) return;
    getReaffectationZone(zone)
      .then((e) => { if (g === generationZone) appliquee = e?.applies_to_output ?? null; })
      .catch(() => { if (g === generationZone) appliquee = null; });
  });

  const nonAppliquee = $derived(regle != null && appliquee === false);

  const texte = $derived(
    regle
      ? $t('v2.cr.badge' as any).replace('{in}', String(regle.entrees)).replace('{out}', String(regle.sorties))
        + (nonAppliquee ? ` · ${$t('v2.cr.badgeNotApplied' as any)}` : '')
      : '',
  );
  const infobulle = $derived(
    regle
      ? $t((nonAppliquee
          ? (cible === 'album' ? 'v2.cr.badgeAlbumNotAppliedTip' : 'v2.cr.badgeZoneNotAppliedTip')
          : (cible === 'album' ? 'v2.cr.badgeAlbumTip' : 'v2.cr.badgeZoneTip')) as any).replace('{in}', String(regle.entrees))
      : '',
  );
</script>

{#if regle}
  <span class="reaff {cible}" class:non-appliquee={nonAppliquee} data-reaffectation={cible}
    data-appliquee={nonAppliquee ? 'false' : undefined} title={infobulle}>{texte}</span>
{/if}

<style>
  /* Sur la fiche album : la forme des étiquettes `.qbadge.cue` de la ligne. */
  .reaff.album{font:700 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.04em; padding:6px 10px; border-radius:8px;
    background:transparent; border:1px solid var(--v2-acc2); color:var(--v2-acc-tint); white-space:nowrap}
  /* Sur une carte de zone : la pastille `.rc.warn` de ZonesV2. */
  .reaff.zone{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); padding:2px 8px; border-radius:999px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); white-space:nowrap}
  /* #9179 — armée mais non appliquée (sortie réseau) : en retrait, bord pointillé. */
  .reaff.non-appliquee{color:var(--v2-txt3); border-style:dashed}
</style>
