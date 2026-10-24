<script lang="ts">
  /**
   * L'assistant dans l'éditeur des collections intelligentes
   * (tune-server-rust #6839) : affiner les règles en une phrase, nommer et
   * décrire. Rien n'est enregistré ici : la proposition s'affiche avec son
   * ÉCART — règles ajoutées et retirées, et albums gagnés et perdus, comptés
   * par l'aperçu du moteur AVANT d'appliquer — puis « Appliquer » la pose
   * dans l'éditeur, où « Annuler » rend les règles d'avant. L'enregistrement
   * reste le bouton habituel de l'éditeur.
   */
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { estEchec, messageDEchec, valeurLisible, type RegleIa } from '../../lib/assistantIa';
  import { affinerCollectionIa, nommerCollectionIa, ecartAlbums, type EcartReglesIa } from '../../lib/assistantIaRc8';

  interface Props {
    nom: string;
    mode: 'all' | 'any';
    regles: RegleIa[];
    onAppliquer: (regles: RegleIa[], mode: 'all' | 'any') => void;
    onNom: (nom: string, description: string) => void;
  }
  let { nom, mode, regles, onAppliquer, onNom }: Props = $props();

  let phrase = $state('');
  let occupe = $state(false);
  let erreur = $state<string | null>(null);
  let proposition = $state<{ rules: RegleIa[]; match_mode: 'all' | 'any' } | null>(null);
  let ecart = $state<EcartReglesIa | null>(null);
  let albums = $state<{ gagnes: number; perdus: number } | null>(null);
  let avant = $state<{ regles: RegleIa[]; mode: 'all' | 'any' } | null>(null);
  let nomPropose = $state<{ name: string; description: string } | null>(null);

  const deltaTexte = $derived(albums
    ? $t('assistantIa.coll.albumsDelta' as any).replace('{n1}', String(albums.gagnes)).replace('{n2}', String(albums.perdus))
    : '');

  const ids = (p: { albums?: any[] } | null | undefined) =>
    (p?.albums ?? []).map((a) => Number(a?.id)).filter((x) => Number.isFinite(x));

  async function affiner() {
    if (!phrase.trim() || occupe) return;
    occupe = true; erreur = null; proposition = null; ecart = null; albums = null;
    try {
      const r = await affinerCollectionIa({
        cible: 'collection', actuelle: { name: nom, match_mode: mode, rules: regles }, phrase: phrase.trim(), langue: $locale,
      });
      if (estEchec(r)) { erreur = messageDEchec(r, (k) => $t(k as any)); return; }
      if (!('proposition' in r)) return;
      proposition = r.proposition;
      ecart = r.ecart;
      // L'écart d'ALBUMS, par l'aperçu du moteur, AVANT d'appliquer.
      const [a, b] = await Promise.all([
        api.previewSmartCollection({ rules: regles, match_mode: mode }).catch(() => null),
        api.previewSmartCollection({ rules: r.proposition.rules, match_mode: r.proposition.match_mode }).catch(() => null),
      ]);
      if (a && b) {
        const e = ecartAlbums(ids(a), ids(b));
        albums = { gagnes: e.gagnes.length, perdus: e.perdus.length };
      }
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }

  function appliquer() {
    if (!proposition) return;
    avant = { regles: regles.map((x) => ({ ...x })), mode };
    onAppliquer(proposition.rules, proposition.match_mode);
    proposition = null;
  }

  function annuler() {
    if (!avant) return;
    onAppliquer(avant.regles, avant.mode);
    avant = null;
  }

  async function nommer() {
    occupe = true; erreur = null; nomPropose = null;
    try {
      const r = await nommerCollectionIa({ cible: 'collection', rules: regles, match_mode: mode, langue: $locale });
      if (estEchec(r)) erreur = messageDEchec(r, (k) => $t(k as any));
      else nomPropose = { name: r.name, description: r.description };
    } catch (e) {
      erreur = (e as Error)?.message ?? $t('assistantIa.err.generique' as any);
    } finally { occupe = false; }
  }
</script>

<div class="col-ia" data-collection-ia>
  <div class="ligne">
    <input type="text" bind:value={phrase} maxlength="500" placeholder={$t('assistantIa.coll.refinePlaceholder' as any)}
      onkeydown={(e) => e.key === 'Enter' && affiner()} />
    <button class="lnk" disabled={occupe || !phrase.trim()} onclick={affiner} data-coll-affiner>{$t('assistantIa.coll.refine' as any)}</button>
    <button class="lnk" disabled={occupe} onclick={nommer} data-coll-nommer>{$t('assistantIa.coll.name' as any)}</button>
    {#if avant}<button class="lnk" onclick={annuler} data-coll-annuler>{$t('assistantIa.coll.undo' as any)}</button>{/if}
  </div>
  {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
  {#if proposition && ecart}
    <div class="prop" data-coll-ecart>
      <p class="note">
        {deltaTexte}
      </p>
      <ul>
        {#each ecart.ajoutees as r, i (i)}<li class="plus">+ <code>{r.field}</code> {r.op} <b>{valeurLisible(r.value)}</b></li>{/each}
        {#each ecart.retirees as r, i (i)}<li class="moins">− <code>{r.field}</code> {r.op} <b>{valeurLisible(r.value)}</b></li>{/each}
      </ul>
      <button class="lnk primaire" onclick={appliquer} data-coll-appliquer>{$t('assistantIa.coll.apply' as any)}</button>
    </div>
  {/if}
  {#if nomPropose}
    <div class="prop">
      <p><b>{nomPropose.name}</b> — {nomPropose.description} <em class="note">({$t('assistantIa.coll.byAi' as any)})</em></p>
      <button class="lnk primaire" onclick={() => { onNom(nomPropose!.name, nomPropose!.description); nomPropose = null; }}>{$t('assistantIa.coll.useName' as any)}</button>
    </div>
  {/if}
</div>

<style>
  .col-ia { border-top: 1px dashed var(--v2-line2); margin-top: 12px; padding-top: 10px; }
  .ligne { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  input { flex: 1 1 240px; background: var(--v2-bg); border: 1px solid var(--v2-line2); border-radius: 8px; color: var(--v2-txt); padding: 6px 10px; font: inherit; }
  .prop { margin-top: 8px; font-size: 13px; }
  ul { list-style: none; margin: 4px 0; padding: 0; }
  .plus { color: var(--v2-ok, #3a9d5d); }
  .moins { color: var(--v2-danger); }
  .note { font-size: 12.5px; color: var(--v2-txt3); margin: 4px 0; }
  .err { font-size: 12.5px; color: var(--v2-danger); }
</style>
