<script lang="ts">
  /**
   * « Signaler » une donnée enrichie — pochette, image ou biographie d'artiste.
   *
   * Porté depuis `ReportButton` de l'ancienne interface, seul appelant de
   * `POST /library/reports` : la phase 5 le retire, et avec lui le seul moyen
   * de dire qu'une pochette ou une image est fausse. Même contrat — une raison
   * choisie dans une liste, l'appel part, le serveur enregistre en local et
   * transmet à la communauté quand le partage est activé —, mêmes clés de
   * langue (`report.*`).
   *
   * Le choix de la raison passe par le menu ancré du nouveau client
   * (`MenuPisteV2`) : un menu de plus qui ne dériverait pas de celui des pistes.
   */
  import * as api from '../../lib/api';
  import type { ReportEntity } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import type { EntreeMenuPiste } from '../../lib/menuPiste';
  import MenuPisteV2 from './MenuPisteV2.svelte';

  interface Props {
    entity: ReportEntity;
    entityId?: number;
    mbid?: string;
    /** Raisons proposées (clés `report.reason.*`). */
    raisons?: string[];
    /** Libellé du bouton ; `report.action` par défaut. */
    libelle?: string;
    onSignale?: () => void;
  }
  let {
    entity, entityId, mbid,
    raisons = ['incorrect', 'wrong_entity', 'poor_quality', 'offensive'],
    libelle, onSignale,
  }: Props = $props();

  const DRAPEAU = 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7';

  let ancre = $state<DOMRect | null>(null);
  let envoi = $state(false);

  async function envoyer(raison: string) {
    if (envoi) return;
    envoi = true;
    try {
      const r = await api.reportMetadata({ entity, entity_id: entityId, mbid, reason: raison });
      notifications.success($t(r?.pushed ? 'report.sentShared' : 'report.sentLocal' as any));
      onSignale?.();
    } catch {
      notifications.error($t('report.failed' as any));
    }
    envoi = false;
  }

  const entrees = $derived<EntreeMenuPiste[]>(
    raisons.map((r) => ({ cle: `report.reason.${r}`, icone: DRAPEAU, faire: () => void envoyer(r) })),
  );
</script>

<button class="ghost" disabled={envoi}
  title={$t('report.chooseReason' as any)}
  onclick={(e) => { e.stopPropagation(); ancre = (e.currentTarget as HTMLElement).getBoundingClientRect(); }}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={DRAPEAU}/></svg>
  {libelle ?? $t('report.action' as any)}
</button>

{#if ancre}
  <MenuPisteV2 {ancre} {entrees} onClose={() => (ancre = null)} />
{/if}

<style>
  .ghost{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 14px; border-radius:var(--v2-r-pill);
    font:600 13px var(--v2-sans); cursor:pointer; color:var(--v2-txt2); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .ghost:disabled{opacity:.55; cursor:default}
  .ghost svg{width:14px; height:14px}
</style>
