<script lang="ts">
  /**
   * #2735 — L'AIDE DERRIÈRE UNE ICÔNE ⓘ (fiche d'appareil, décision de
   * Bertrand du 09/11/2026 : « écran beaucoup trop chargé »).
   *
   * Le paragraphe d'aide n'occupe plus la fiche : il s'ouvre au survol, au
   * focus clavier, ou au clic (bascule), et se referme à Échap ou à la perte
   * du focus. Le texte reste dans le DOM, relié au bouton par
   * `aria-describedby` : un lecteur d'écran le lit sans rien ouvrir.
   */
  import { t } from '../../lib/i18n';

  let { texte, libelle = '', classeBulle = '' }: { texte: string; libelle?: string; classeBulle?: string } = $props();
  let ouvert = $state(false);
  const id = `aide-${Math.random().toString(36).slice(2, 9)}`;
</script>

<span class="aide" data-aide>
  <button type="button" class="aide-btn" aria-describedby={id} aria-expanded={ouvert}
    aria-label={$t('reglages.aideDe' as any).replace('{libelle}', libelle)}
    onclick={() => (ouvert = !ouvert)}
    onkeydown={(e) => { if (e.key === 'Escape' && ouvert) { e.stopPropagation(); ouvert = false; } }}
    onblur={() => (ouvert = false)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>
  </button>
  <span role="tooltip" {id} class="aide-bulle {classeBulle}" class:ouvert>{texte}</span>
</span>

<style>
  .aide{position:relative; display:inline-flex; align-items:center; flex:0 0 auto}
  .aide-btn{display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; padding:0;
    border:0; border-radius:50%; background:transparent; color:var(--v2-txt3); cursor:pointer}
  .aide-btn:hover, .aide-btn:focus-visible{color:var(--v2-acc1)}
  .aide-btn:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:1px}
  .aide-btn svg{width:15px; height:15px}
  .aide-bulle{display:none; position:absolute; z-index:20; top:calc(100% + 6px); right:0; width:max-content; max-width:300px;
    padding:9px 11px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg);
    box-shadow:0 8px 24px var(--v2-sh-sm); font:12px/1.5 var(--v2-sans); color:var(--v2-txt2);
    white-space:normal; text-transform:none; letter-spacing:0}
  .aide:hover .aide-bulle, .aide-btn:focus-visible + .aide-bulle, .aide-bulle.ouvert{display:block}
</style>
