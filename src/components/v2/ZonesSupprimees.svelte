<script lang="ts">
  /*
   * tune-server-rust#7836 (fil 2642, décision de Bertrand du 10/11) —
   * « Zones supprimées (n) » dans Réglages › Zones.
   *
   * Supprimer une zone la MASQUE : la découverte ne la recrée pas, et le seul
   * chemin pour la retrouver passait par « Nouvelle zone », où un testeur ne
   * l'a pas cherchée (son MacBook AirPlay 2 paraissait « invisible »). Le lien
   * est grisé quand il n'y a rien ; ouvert, il liste les zones supprimées,
   * chacune avec un bouton Restaurer.
   */
  import { untrack } from 'svelte';
  import * as api from '../../lib/api';
  import type { ZoneSupprimee } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dateCourte } from '../../lib/dates';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { zones as zonesVisibles } from '../../lib/stores/zones';

  let { onRestauree }: { onRestauree?: () => void | Promise<void> } = $props();

  /** `null` : serveur sans la route, rien n'est affiché. */
  let supprimees = $state<ZoneSupprimee[] | null>(null);
  let ouvert = $state(false);
  let enCours = $state<number | null>(null);

  async function charger() {
    supprimees = await api.getZonesSupprimees();
    if (supprimees !== null && supprimees.length === 0) ouvert = false;
  }
  // À l'ouverture, puis à chaque changement de la liste des zones visibles :
  // une zone supprimée sur ce même écran apparaît aussitôt ici (et une zone
  // restaurée en sort). L'effet ne lit que la liste visible.
  $effect(() => {
    void $zonesVisibles.map((z) => z.id).join(',');
    untrack(() => { charger(); });
  });

  async function restaurer(z: ZoneSupprimee) {
    if (enCours !== null) return;
    enCours = z.id;
    try {
      await api.restaurerZone(z.id);
      await charger();
      await onRestauree?.();
    } catch (e) {
      notifierErreur($t('v2.zones.restoreFailed' as any), e);
    } finally {
      enCours = null;
    }
  }
</script>

{#if supprimees !== null}
  <div class="supprimees" data-zones-supprimees={supprimees.length}>
    <button class="lien" disabled={supprimees.length === 0} aria-expanded={ouvert}
      onclick={() => (ouvert = !ouvert)}>
      {$t('v2.zones.deletedZones' as any).replace('{n}', String(supprimees.length))}
    </button>
    {#if ouvert && supprimees.length}
      <ul class="liste">
        {#each supprimees as z (z.id)}
          <li data-zone-supprimee={z.id}>
            <span class="nom">{z.name}</span>
            {#if z.output_type}<em>{z.output_type}</em>{/if}
            {#if z.masquee_le}
              <span class="quand">{$t('v2.zones.deletedOn' as any).replace('{date}', $dateCourte(z.masquee_le))}</span>
            {/if}
            {#if !z.appareil_detecte}
              <span class="quand">{$t('v2.zones.deviceNotDetected' as any)}</span>
            {/if}
            <button class="v2-btn" disabled={enCours !== null} onclick={() => restaurer(z)}>
              {$t('v2.zones.restore' as any)}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .supprimees{margin:0 30px 10px}
  .lien{border:0; background:transparent; padding:0; color:var(--v2-acc1); cursor:pointer;
    font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); text-decoration:underline}
  .lien:disabled{color:var(--v2-txt3); cursor:default; text-decoration:none}
  .liste{list-style:none; margin:10px 0 0; padding:0; display:flex; flex-direction:column; gap:8px}
  .liste li{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:9px 12px;
    border-radius:9px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .nom{font-size:calc(13px * var(--v2-txt-echelle, 1))}
  em{font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); font-style:normal}
  .quand{font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .liste li button{margin-left:auto}
</style>
