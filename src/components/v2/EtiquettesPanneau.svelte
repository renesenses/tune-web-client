<script lang="ts">
  /**
   * Étiquettes d'un objet : voir, ajouter, retirer.
   *
   * Le geste du bouton bas-droit de `PochetteActions`. L'écran actuel savait
   * déjà le faire, mais uniquement pour un album et uniquement DANS
   * `LibraryView` — une centaine de lignes mêlées à son panneau de détail,
   * inaccessibles depuis ailleurs. Ce composant les sort de là.
   *
   * ## Une surcouche, pas un menu déroulant
   *
   * Une vignette de grille fait 160 px : un menu ancré dessus sortirait de la
   * grille et se ferait couper par le défilement du conteneur. La surcouche
   * centrée n'a pas ce problème, et donne la place d'écrire un nom.
   *
   * ## Créer une étiquette depuis ici
   *
   * `createTag` puis `tagItem` : deux appels, parce que le serveur n'a pas de
   * route qui fasse les deux. Si la création réussit et l'attachement échoue,
   * l'étiquette existe sans être posée — c'est le comportement du serveur, pas
   * un choix ; on le SIGNALE plutôt que de le taire.
   */
  import { onMount } from 'svelte';
  import { portail } from '../../lib/portail';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';

  interface Props {
    itemType: string;
    itemId: number;
    nom?: string;
    onClose: () => void;
  }
  let { itemType, itemId, nom = '', onClose }: Props = $props();

  let posees = $state<any[]>([]);
  let toutes = $state<any[]>([]);
  let chargement = $state(true);
  let travail = $state(false);
  let saisie = $state('');

  /** Les étiquettes disponibles qui ne sont pas déjà posées. */
  const proposables = $derived(
    toutes.filter((x) => !posees.some((p) => p.id === x.id)),
  );

  async function charger() {
    chargement = true;
    const [p, a] = await Promise.allSettled([
      api.getTagsForItem(itemType, itemId),
      api.getTags(itemType),
    ]);
    posees = p.status === 'fulfilled' ? ((p.value as any[]) ?? []) : [];
    toutes = a.status === 'fulfilled' ? ((a.value as any[]) ?? []) : [];
    chargement = false;
  }

  async function poser(tag: any) {
    if (travail) return;
    travail = true;
    try {
      await api.tagItem(tag.id, itemType, itemId);
      posees = [...posees, tag];
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    travail = false;
  }

  async function retirer(tag: any) {
    if (travail) return;
    travail = true;
    try {
      await api.untagItem(tag.id, itemType, itemId);
      posees = posees.filter((x) => x.id !== tag.id);
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    travail = false;
  }

  async function creer() {
    const nomTag = saisie.trim();
    if (!nomTag || travail) return;
    travail = true;
    try {
      const cree = await api.createTag(nomTag);
      if (cree?.id) {
        // Deux appels : le serveur n'a pas de route qui crée ET pose.
        await api.tagItem(cree.id, itemType, itemId);
        posees = [...posees, cree];
        toutes = [...toutes, cree];
        saisie = '';
      }
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    travail = false;
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => {
    void charger();
  });
</script>

<svelte:window onkeydown={auClavier} />

<!-- Le fond ferme au clic. `role="presentation"` : ce n'est pas un contrôle,
     c'est la zone morte autour du panneau. -->
<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div
    class="panneau"
    role="dialog"
    aria-modal="true"
    aria-label={$t('v2.cover.tags' as any)}
    onclick={(e) => e.stopPropagation()}
  >
    <header>
      <h2>{$t('v2.cover.tags' as any)}</h2>
      {#if nom}<p class="objet">{nom}</p>{/if}
      <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>
    </header>

    {#if chargement}
      <p class="etat">{$t('common.loading' as any)}</p>
    {:else}
      <section>
        <h3>{$t('v2.tags.onThis' as any)}</h3>
        {#if !posees.length}
          <p class="etat">{$t('v2.tags.none' as any)}</p>
        {:else}
          <ul class="puces">
            {#each posees as tag (tag.id)}
              <li>
                <span class="puce" style={tag.color ? `--c:${tag.color}` : ''}>
                  {tag.name}
                  <button
                    class="x"
                    disabled={travail}
                    aria-label={$t('v2.tags.remove' as any)}
                    onclick={() => retirer(tag)}>×</button
                  >
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section>
        <h3>{$t('v2.tags.add' as any)}</h3>
        {#if proposables.length}
          <ul class="puces">
            {#each proposables as tag (tag.id)}
              <li>
                <button
                  class="puce ajoutable"
                  style={tag.color ? `--c:${tag.color}` : ''}
                  disabled={travail}
                  onclick={() => poser(tag)}>+ {tag.name}</button
                >
              </li>
            {/each}
          </ul>
        {/if}
        <form class="creer" onsubmit={(e) => { e.preventDefault(); void creer(); }}>
          <input
            bind:value={saisie}
            placeholder={$t('v2.tags.newPlaceholder' as any)}
            aria-label={$t('v2.tags.newPlaceholder' as any)}
          />
          <button type="submit" disabled={travail || !saisie.trim()}>{$t('v2.tags.create' as any)}</button>
        </form>
      </section>
    {/if}
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
    width: min(440px, 100%);
    max-height: 80vh;
    overflow-y: auto;
    background: var(--v2-surface);
    color: var(--v2-txt);
    border: 1px solid var(--v2-line2);
    border-radius: var(--v2-r-card);
    padding: 20px 22px 22px;
    font-family: var(--v2-sans);
  }
  header h2 { font-size: 17px; font-weight: 700; }
  .objet { color: var(--v2-txt2); font-size: 13px; margin-top: 2px; }
  .fermer {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--v2-txt3);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
  .fermer:hover { background: var(--v2-surface2); color: var(--v2-txt); }
  section { margin-top: 18px; }
  h3 {
    font: 600 11px var(--v2-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--v2-txt3);
    margin-bottom: 8px;
  }
  .etat { color: var(--v2-txt3); font-size: 13px; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; }
  .puce {
    --c: var(--v2-acc1);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
    border-radius: var(--v2-r-pill);
    background: color-mix(in srgb, var(--c) 14%, transparent);
    color: var(--v2-txt);
    font-size: 12.5px;
  }
  .puce.ajoutable { cursor: pointer; }
  .puce.ajoutable:hover { background: color-mix(in srgb, var(--c) 26%, transparent); }
  .x {
    border: 0;
    background: transparent;
    color: var(--v2-txt2);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    padding: 0 1px;
  }
  .x:hover { color: var(--v2-txt); }
  .creer { display: flex; gap: 6px; margin-top: 10px; }
  .creer input {
    flex: 1;
    min-width: 0;
    background: var(--v2-bg);
    border: 1px solid var(--v2-line2);
    border-radius: 8px;
    color: var(--v2-txt);
    font: inherit;
    font-size: 13px;
    padding: 7px 9px;
  }
  .creer button {
    border: 1px solid var(--v2-line2);
    border-radius: 8px;
    background: var(--v2-surface2);
    color: var(--v2-txt);
    font: 600 13px var(--v2-sans);
    padding: 7px 12px;
    cursor: pointer;
  }
  .creer button:disabled { opacity: 0.5; cursor: default; }
</style>
