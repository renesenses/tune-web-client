<script lang="ts">
  import { t } from '../../lib/i18n';
  import { disponibiliteUpnp, etatSourceUpnp } from '../../lib/stores/disponibiliteUpnp';
  let { sourceId }: { sourceId?: string | null } = $props();
  const constat = $derived(etatSourceUpnp(sourceId, $disponibiliteUpnp));
  const libelle = $derived($t(`upnp.availability.${constat.etat}` as any));
</script>

<span class="disponibilite" class:absent={constat.etat === 'absent' || constat.etat === 'disabled'}
  title={`${constat.nom ? `${constat.nom} — ` : ''}${libelle}. ${$t('upnp.availability.hint' as any)}`}>
  {libelle}
</span>

<style>
  .disponibilite{font:500 10px var(--v2-sans); color:var(--v2-txt3); white-space:nowrap}
  .disponibilite.absent{color:var(--v2-danger)}
</style>
