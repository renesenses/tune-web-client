<script lang="ts">
  /**
   * Collections proposées par l'assistant (tune-server-rust #6839) : 5 à 10
   * collections depuis les seules STATISTIQUES de la bibliothèque, ou, en
   * Premium (comme « Mon écoute »), d'après l'écoute. Chacune montre ses
   * règles et le nombre d'albums que le moteur retiendrait ; rien n'est créé
   * sans un geste (« Créer »).
   */
  import { t, locale } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import * as api from '../../lib/api';
  import { currentProfileId } from '../../lib/stores/profile';
  import { estEchec, messageDEchec, valeurLisible } from '../../lib/assistantIa';
  import {
    proposerCollectionsIa, collectionsEcouteIa, coutLisible,
    type CollectionProposeeIa, type ApercuIa,
  } from '../../lib/assistantIaRc8';

  interface Props { onClose: () => void; onCreee: () => void }
  let { onClose, onCreee }: Props = $props();

  let liste = $state<CollectionProposeeIa[]>([]);
  let comptes = $state<Record<number, number | null>>({});
  let creees = $state<Set<number>>(new Set());
  let apercu = $state<ApercuIa | null>(null);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  async function demander(ecoute: boolean, voirAvant = false) {
    occupe = true; erreur = null; apercu = null;
    try {
      const o = { langue: $locale, apercu: voirAvant };
      const r = ecoute ? await collectionsEcouteIa({ ...o, profil_id: $currentProfileId }) : await proposerCollectionsIa(o);
      if (estEchec(r)) {
        erreur = r.error === 'premium_requis' ? $t('assistantIa.coll.premium' as any) : messageDEchec(r, (k) => $t(k as any));
        return;
      }
      if ('apercu' in r && r.apercu) { apercu = r as ApercuIa; return; }
      if ('collections' in r) {
        liste = r.collections; creees = new Set(); comptes = {};
        liste.forEach((c, i) => {
          api.previewSmartCollection({ rules: c.rules, match_mode: c.match_mode })
            .then((p) => { comptes = { ...comptes, [i]: p?.total ?? 0 }; })
            .catch(() => { comptes = { ...comptes, [i]: null }; });
        });
      }
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  async function creer(i: number) {
    const c = liste[i];
    try {
      await api.createSmartCollection({ name: c.name, description: c.description || undefined, rules: c.rules, match_mode: c.match_mode } as any);
      creees = new Set([...creees, i]);
      onCreee();
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('assistantIa.coll.proposeTitle' as any)}
    onclick={(e) => e.stopPropagation()} data-propositions-collections-ia>
    <h2>{$t('assistantIa.coll.proposeTitle' as any)}</h2>
    <button class="fermer" aria-label={$t('assistantIa.close' as any)} onclick={onClose}>×</button>
    <p class="note">{$t('assistantIa.coll.proposeIntro' as any)}</p>
    <div class="pied">
      <button class="sec" disabled={occupe} onclick={() => demander(false, true)}>{$t('assistantIa.preview.button' as any)}</button>
      <button class="sec" disabled={occupe} onclick={() => demander(true)} data-coll-ecoute>{$t('assistantIa.coll.fromListening' as any)}</button>
      <button class="pri" disabled={occupe} onclick={() => demander(false)} data-coll-proposer>
        {occupe ? $t('assistantIa.playlist.thinking' as any) : $t('assistantIa.coll.propose' as any)}
      </button>
    </div>
    {#if apercu}
      <details class="res" open>
        <summary>{$t('assistantIa.preview.what' as any)} — {coutLisible(apercu.cout_estime_eur, $locale)}</summary>
        <pre>{apercu.envoye.message}</pre>
      </details>
    {/if}
    {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    {#each liste as c, i (i)}
      <section class="res">
        <h3>{c.name} <em class="note">({$t('assistantIa.coll.byAi' as any)})</em></h3>
        {#if c.description}<p class="note">{c.description}</p>{/if}
        <ul class="regles">{#each c.rules as r, j (j)}<li><code>{r.field}</code> {r.op} <b>{valeurLisible(r.value)}</b></li>{/each}</ul>
        <p class="note">
          {comptes[i] == null ? '' : $t('v2.smart.previewCount' as any).replace('{n}', String(comptes[i]))}
        </p>
        <button class="pri" disabled={creees.has(i)} onclick={() => creer(i)}>
          {creees.has(i) ? $t('assistantIa.coll.created' as any) : $t('assistantIa.coll.create' as any)}
        </button>
      </section>
    {/each}
  </div>
</div>

<style>
  .fond { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; background: rgba(0, 0, 0, 0.55); padding: 20px; }
  .panneau { position: relative; width: min(620px, 100%); max-height: 90vh; overflow: auto; background: var(--v2-surface); color: var(--v2-txt); border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card); padding: 20px 22px 22px; font-family: var(--v2-sans); }
  h2 { font-size: 17px; font-weight: 700; margin: 0 0 10px; }
  h3 { font-size: 14px; margin: 10px 0 4px; }
  .fermer { position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: var(--v2-txt3); font-size: 20px; cursor: pointer; }
  .res { border-top: 1px solid var(--v2-line); margin-top: 10px; padding-top: 4px; }
  .regles { list-style: none; margin: 0; padding: 0; font-size: 13px; }
  pre { white-space: pre-wrap; font-size: 11.5px; max-height: 240px; overflow: auto; background: var(--v2-bg); padding: 8px; border-radius: 6px; }
  .pied { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  .pri, .sec { border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt); }
  .pri { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .pri:disabled, .sec:disabled { opacity: 0.45; cursor: default; }
  .note { font-size: 12.5px; color: var(--v2-txt3); margin: 4px 0; }
  .err { font-size: 12.5px; color: var(--v2-danger); }
</style>
