<script lang="ts">
  /**
   * « Nouvelle station » : trois chemins, comme chez Roon (rapport de Rémi,
   * RC7, #2397).
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';

  import { URL_PROPOSER } from '../../lib/mesRadios';

  let { onAnnuaire, onSaisie, onClose }: {
    onAnnuaire: () => void; onSaisie: () => void; onClose: () => void;
  } = $props();
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('v2.radio.create' as any)}
    onclick={(e) => e.stopPropagation()}>
    <h2>{$t('v2.radio.create' as any)}</h2>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>
    <button class="choix" data-choix="annuaire" onclick={onAnnuaire}>
      <b>{$t('v2.radio.new.directory' as any)}</b>
      <span>{$t('v2.radio.new.directoryHint' as any)}</span>
    </button>
    <a class="choix" data-choix="proposer" href={URL_PROPOSER} target="_blank" rel="noopener noreferrer" onclick={onClose}>
      <b>{$t('v2.radio.new.propose' as any)}</b>
      <span>{$t('v2.radio.new.proposeHint' as any)}</span>
    </a>
    <button class="choix" data-choix="saisie" onclick={onSaisie}>
      <b>{$t('v2.radio.new.local' as any)}</b>
      <span>{$t('v2.radio.new.localHint' as any)}</span>
    </button>
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center;
    background:rgba(0,0,0,.55); padding:20px}
  .panneau{position:relative; width:min(460px,100%); display:flex; flex-direction:column; gap:10px;
    background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-card); padding:20px 22px 22px; font-family:var(--v2-sans)}
  h2{font-size:17px; font-weight:700; margin-bottom:6px}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:20px; line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .choix{display:flex; flex-direction:column; gap:3px; text-align:left; text-decoration:none; cursor:pointer;
    background:var(--v2-bg); color:var(--v2-txt); border:1px solid var(--v2-line2); border-radius:10px; padding:12px 14px}
  .choix:hover{border-color:var(--v2-acc1)}
  .choix b{font:600 13.5px var(--v2-sans)}
  .choix span{font:12px var(--v2-sans); color:var(--v2-txt2)}
</style>
