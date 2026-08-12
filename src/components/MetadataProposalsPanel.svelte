<script lang="ts">
  /*
   * Ce que d'autres bibliotheques affirment sur les albums qu'on possede.
   *
   * L'ecran ne dit jamais « corrigez ceci » : il montre les deux valeurs et
   * qui porte chacune. Refuser est un geste aussi legitime qu'accepter — c'est
   * une voix pour la valeur qu'on a deja, pas un rejet a rattraper. Les deux
   * boutons ont donc le meme poids visuel.
   */
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  interface Props {
    proposals: api.MetadataProposal[];
    autoApply: boolean;
    /** Rendre la main au parent : une decision change la bibliotheque. */
    onDecided: () => void;
    onClose: () => void;
  }

  let { proposals, autoApply, onDecided, onClose }: Props = $props();

  /* Les lignes en cours de traitement, pour ne pas cliquer deux fois. */
  let enCours = $state<Set<number>>(new Set());
  let bascule = $state(autoApply);

  async function decider(id: number, accepte: boolean) {
    if (enCours.has(id)) return;
    enCours = new Set(enCours).add(id);
    try {
      await api.decideMetadataProposal(id, accepte);
      onDecided();
    } catch (e) {
      // La proposition reste en attente cote serveur : rien n'a ete applique,
      // rien n'a ete compte. Le message le dit plutot que de faire disparaitre
      // la ligne comme si c'etait fait.
      notifications.error($t('metadataProposals.decisionFailed'));
      enCours = new Set([...enCours].filter((x) => x !== id));
    }
  }

  async function basculer() {
    const voulu = !bascule;
    try {
      await api.setMetadataProposalsAutoApply(voulu);
      bascule = voulu;
      notifications.success(
        voulu
          ? $t('metadataProposals.autoApplyOn')
          : $t('metadataProposals.autoApplyOff'),
      );
    } catch (e) {
      notifications.error($t('metadataProposals.autoApplyFailed'));
    }
  }

  function libelleChamp(champ: string): string {
    const cle = `metadataProposals.field.${champ}`;
    const traduit = $t(cle);
    return traduit === cle ? champ : traduit;
  }
</script>

<div class="proposals-panel">
  <div class="proposals-header">
    <h3>{$t('metadataProposals.title')} ({proposals.length})</h3>
    <button class="action-btn ghost" onclick={onClose}>{$t('common.close')}</button>
  </div>

  <p class="proposals-intro">{$t('metadataProposals.intro')}</p>

  {#if proposals.length === 0}
    <div class="proposals-empty">{$t('metadataProposals.empty')}</div>
  {:else}
    {#each proposals as p (p.id)}
      <div class="proposal-row" class:busy={enCours.has(p.id)}>
        <div class="proposal-album">
          <span class="proposal-title">{p.title || '—'}</span>
          <span class="proposal-artist">{p.artist || '—'}</span>
        </div>
        <span class="proposal-field">{libelleChamp(p.field)}</span>
        <span class="proposal-current">{p.current || '—'}</span>
        <span class="proposal-arrow">→</span>
        <span class="proposal-value">{p.proposed || '—'}</span>
        <span class="proposal-support">
          {$t('metadataProposals.support').replace('{count}', String(p.servers_count))}
        </span>
        <button
          class="btn-accept"
          disabled={enCours.has(p.id)}
          onclick={() => decider(p.id, true)}
        >{$t('metadataProposals.accept')}</button>
        <button
          class="btn-keep"
          disabled={enCours.has(p.id)}
          onclick={() => decider(p.id, false)}
        >{$t('metadataProposals.keep')}</button>
      </div>
    {/each}
  {/if}

  <label class="proposals-auto">
    <input type="checkbox" checked={bascule} onchange={basculer} />
    <span>
      <strong>{$t('metadataProposals.autoApply')}</strong>
      <em>{$t('metadataProposals.autoApplyHint')}</em>
    </span>
  </label>
</div>

<style>
  .proposals-panel {
    background: var(--tune-bg-secondary, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--tune-border, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    padding: 12px;
    margin: 12px 0;
  }
  .proposals-header { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .proposals-header h3 { margin: 0; flex: 1; font-size: 0.95rem; }
  .action-btn { background: var(--tune-accent, #00bcd4); border: none; color: #001; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
  .action-btn.ghost { background: transparent; border: 1px solid var(--tune-border); color: var(--tune-text-muted); }
  .proposals-intro { margin: 0 0 10px; font-size: 0.8rem; color: var(--tune-text-muted); line-height: 1.45; }
  .proposals-empty { padding: 18px; text-align: center; font-size: 0.85rem; color: var(--tune-text-muted); }

  .proposal-row {
    display: grid;
    grid-template-columns: minmax(140px, 2fr) 70px minmax(60px, 1fr) auto minmax(60px, 1fr) auto auto auto;
    gap: 8px;
    padding: 6px;
    align-items: center;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.02);
    margin-bottom: 4px;
    font-size: 0.85rem;
  }
  .proposal-row.busy { opacity: 0.5; }
  .proposal-album { display: flex; flex-direction: column; min-width: 0; }
  .proposal-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .proposal-artist { font-size: 0.72rem; color: var(--tune-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .proposal-field { font-weight: 600; color: var(--tune-text-muted); text-transform: uppercase; font-size: 0.7rem; }
  .proposal-current { color: var(--tune-text-muted); }
  .proposal-arrow { color: var(--tune-accent, #00bcd4); }
  .proposal-value { color: var(--tune-text); font-weight: 500; }
  .proposal-support { color: var(--tune-text-muted); font-size: 0.72rem; text-align: right; white-space: nowrap; }

  /* Accepter et conserver ont le meme poids : garder sa valeur n'est pas un
     refus a rattraper, c'est une reponse. */
  .btn-accept, .btn-keep {
    border: none;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.78rem;
  }
  .btn-accept { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
  .btn-keep { background: rgba(148, 163, 184, 0.15); color: var(--tune-text-muted); }
  .btn-accept:disabled, .btn-keep:disabled { cursor: default; opacity: 0.4; }

  .proposals-auto {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--tune-border, rgba(255, 255, 255, 0.1));
    font-size: 0.82rem;
    cursor: pointer;
  }
  .proposals-auto span { display: flex; flex-direction: column; gap: 2px; }
  .proposals-auto em { font-style: normal; font-size: 0.74rem; color: var(--tune-text-muted); line-height: 1.4; }

  @media (max-width: 720px) {
    .proposal-row { grid-template-columns: 1fr auto auto; grid-auto-flow: row; }
    .proposal-field, .proposal-arrow, .proposal-support { display: none; }
  }
</style>
