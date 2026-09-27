<script lang="ts">
  /**
   * Badge « verrou de volume » sur la carte d'une zone (#2395, #2506).
   *
   * ── CE QU'IL REMPLACE ────────────────────────────────────────────────────
   *
   * Le badge vivait dans `DevicesSettings.svelte`, à la ligne 175, sous un
   * `use:tip={'devices.volumeLockHint'}`. La phase 5 (d5ed7deb, 19/09/2026) a
   * supprimé ce composant avec les 64 vues de l'ancienne interface, et le badge
   * est parti avec lui — pas seulement son infobulle : le badge ENTIER. Depuis,
   * `volumeLockBadge()` n'avait plus aucun appelant de production, et
   * l'utilisateur qui regardait « son » Denon ne pouvait plus savoir si le
   * verrou le concernait, ni d'où il venait.
   *
   * ── POURQUOI UN COMPOSANT À PART ─────────────────────────────────────────
   *
   * La carte de zone vit aujourd'hui dans `SettingsV2.svelte` (section
   * `perZone`, onglet Appareils), un fichier de 5 750 lignes que plusieurs lots
   * se partagent. Le badge y entre par une ligne, et sa décision — quoi
   * afficher, quand se taire — reste montable seule dans jsdom. C'est la
   * garantie que réclame l'en-tête de `lib/audiophileLockBadge.ts` : le coût
   * d'erreur est MATÉRIEL (une paire d'enceintes détruite chez un testeur), et
   * un badge qui annoncerait « non verrouillé » sur une zone qui part à 100 %
   * serait pire que pas de badge du tout.
   *
   * ── LECTURE SEULE, ET UNE SEULE SOURCE ───────────────────────────────────
   *
   * Aucun contrôle, aucun clic : le verrou se règle ailleurs (réglage général,
   * et surcharge par zone dans le panneau « chemin du signal »). Deux points de
   * commande pour un même réglage, c'est ainsi qu'on finit par en armer un sans
   * le savoir.
   *
   * La valeur affichée est `effective_lock_volume`, RÉSOLUE PAR LE SERVEUR
   * (`volume_lock_override(zone).unwrap_or(global)`). Le client ne rejoue pas
   * l'héritage : il n'aurait aucun moyen de vérifier qu'il tombe juste, et ce
   * serait une seconde occasion de mentir.
   *
   * ── PAS D'INFOBULLE, ET C'EST DÉLIBÉRÉ ───────────────────────────────────
   *
   * 🔴 `devices.volumeLockHint` dit « Information seule. Ce verrou se règle dans
   * Réglages → Général → Lecture. » Ce n'était vrai qu'avant le portage v2 : le
   * verrou se règle AUSSI par zone, depuis le panneau « chemin du signal »
   * (`audiophile.lockVolumeZone`). Le texte est donc incomplet dans onze
   * langues, et le réécrire est une décision produit, pas une correction de
   * code. Le badge est rendu SANS infobulle en attendant l'arbitrage de
   * Bertrand : un badge muet vaut mieux qu'un badge qui envoie l'utilisateur au
   * mauvais écran.
   */
  import { onDestroy } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { audiophileGlobalLockVolume } from '../../lib/stores/audiophile';
  import {
    volumeLockBadge,
    volumeLockLabelKey,
    volumeLockOriginKey,
    type VolumeLockBadge,
  } from '../../lib/audiophileLockBadge';

  interface Props {
    /** Identifiant de la zone. `null` : rien à dire, rien à afficher. */
    zoneId: number | null | undefined;
  }
  let { zoneId }: Props = $props();

  let badge = $state<VolumeLockBadge | null>(null);

  // Une réponse tardive d'une zone qu'on vient de quitter ne doit pas écraser
  // celle qu'on regarde — même garde que celle du store audiophile.
  let generation = 0;
  onDestroy(() => { generation += 1; });

  /**
   * Relu quand la zone change ET quand le défaut global change : une zone en
   * héritage voit alors son badge suivre, sans que le client recalcule
   * l'héritage lui-même.
   */
  $effect(() => {
    const id = zoneId;
    void $audiophileGlobalLockVolume;
    const gen = ++generation;
    if (id == null) {
      badge = null;
      return;
    }
    void api
      .getAudiophileMode(id)
      .then((state) => {
        if (gen === generation) badge = volumeLockBadge(state);
      })
      .catch(() => {
        // Injoignable : on RETIRE le badge plutôt que d'en garder un périmé.
        // Se taire est le seul repli acceptable — toute valeur de repli serait
        // une invention, et celle-ci se paye en matériel.
        if (gen === generation) badge = null;
      });
  });
</script>

{#if badge}
  <span class="vl" class:on={badge.locked}>
    <span class="vl-etat">{$t(volumeLockLabelKey(badge) as any)}</span>
    <span class="vl-prov">{$t(volumeLockOriginKey(badge) as any)}</span>
  </span>
{/if}

<style>
  /* Deux lignes de texte, aucune surface cliquable : le badge INFORME. */
  .vl{
    display:inline-flex; flex-direction:column; gap:1px;
    font:9.5px var(--v2-mono); letter-spacing:.06em;
    border:1px solid var(--v2-line); border-radius:3px;
    padding:2px 6px; white-space:nowrap; align-self:center;
    color:var(--v2-txt2);
  }
  /* Verrou ARMÉ : la couleur d'accent, parce que c'est l'état qui a un coût. */
  .vl.on{color:var(--v2-acc1); border-color:var(--v2-acc1)}
  .vl-etat{text-transform:uppercase; font-weight:600}
  .vl-prov{opacity:.75}
</style>
