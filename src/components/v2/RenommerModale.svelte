<script lang="ts">
  /**
   * Renommer un objet, et corriger sa description.
   *
   * Le geste d'édition d'une playlist. C'est TOUT ce que le serveur accepte de
   * modifier sur une playlist — `PUT /playlists/{id}` ne prend que `name` et
   * `description` —, donc une modale qui offrirait davantage mentirait sur ce
   * qu'elle sait faire.
   *
   * Volontairement générique : une collection présente exactement les deux
   * mêmes champs, et n'aura pas besoin d'un second écran.
   *
   * Déplacée à la racine du document, comme le panneau d'étiquettes : ouverte
   * depuis une vignette, une surcouche `fixed` se ferait enfermer dans son
   * ancêtre contenu.
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { notifications } from '../../lib/stores/notifications';

  interface Props {
    titre: string;
    nom: string;
    description?: string | null;
    /** Rend l'objet mis à jour, ou lève. La modale ne se ferme qu'au succès. */
    enregistrer: (valeurs: { name: string; description: string }) => Promise<unknown>;
    onClose: () => void;
    onSaved?: (valeurs: { name: string; description: string }) => void;
  }
  let { titre, nom, description = '', enregistrer, onClose, onSaved }: Props = $props();

  let saisieNom = $state(nom);
  let saisieDesc = $state(description ?? '');
  let travail = $state(false);

  const modifie = $derived(saisieNom.trim() !== nom || saisieDesc !== (description ?? ''));

  async function valider(e: Event) {
    e.preventDefault();
    const n = saisieNom.trim();
    if (!n || travail) return;
    travail = true;
    try {
      const valeurs = { name: n, description: saisieDesc };
      await enregistrer(valeurs);
      onSaved?.(valeurs);
      onClose();
    } catch (err: any) {
      // On NE ferme pas : fermer sur échec ferait croire à un enregistrement.
      notifications.error(err?.message ?? $t('common.error' as any));
    }
    travail = false;
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div
    class="panneau"
    role="dialog"
    aria-modal="true"
    aria-label={titre}
    onclick={(e) => e.stopPropagation()}
  >
    <h2>{titre}</h2>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>

    <form onsubmit={valider}>
      <label>
        <span>{$t('v2.edit.name' as any)}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={saisieNom} autofocus required />
      </label>
      <label>
        <span>{$t('v2.edit.description' as any)}</span>
        <textarea bind:value={saisieDesc} rows="3"></textarea>
      </label>
      <div class="pied">
        <button type="button" class="sec" onclick={onClose}>{$t('common.cancel' as any)}</button>
        <button type="submit" class="pri" disabled={travail || !saisieNom.trim() || !modifie}>
          {$t('common.save' as any)}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .fond {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.55);
    padding: 20px;
  }
  .panneau {
    position: relative;
    width: min(420px, 100%);
    background: var(--v2-surface);
    color: var(--v2-txt);
    border: 1px solid var(--v2-line2);
    border-radius: var(--v2-r-card);
    padding: 20px 22px 22px;
    font-family: var(--v2-sans);
  }
  h2 { font-size: 17px; font-weight: 700; margin-bottom: 16px; }
  .fermer {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
    border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3);
    font-size: 20px; line-height: 1; cursor: pointer;
  }
  .fermer:hover { background: var(--v2-surface2); color: var(--v2-txt); }
  label { display: block; margin-bottom: 12px; }
  label span {
    display: block; margin-bottom: 5px;
    font: 600 11px var(--v2-mono); letter-spacing: .06em; text-transform: uppercase;
    color: var(--v2-txt3);
  }
  input, textarea {
    width: 100%; box-sizing: border-box;
    background: var(--v2-bg); border: 1px solid var(--v2-line2); border-radius: 8px;
    color: var(--v2-txt); font: inherit; font-size: 13.5px; padding: 8px 10px;
    resize: vertical;
  }
  input:focus, textarea:focus { outline: 2px solid var(--v2-acc1); outline-offset: -1px; }
  .pied { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  .pied button {
    border-radius: 8px; font: 600 13px var(--v2-sans); padding: 8px 14px; cursor: pointer;
  }
  .sec { border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt2); }
  .sec:hover { color: var(--v2-txt); }
  .pri { border: 0; background: var(--v2-acc1); color: var(--v2-on-acc); }
  .pri:disabled { opacity: .5; cursor: default; }
</style>
