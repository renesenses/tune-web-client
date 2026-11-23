<script lang="ts">
  // #2853 — sélecteur d'emojis léger de la messagerie Tune Circle : liste
  // intégrée (lib/emojis), récents de ce navigateur, recherche FR + EN,
  // clavier (flèches, Entrée, Échap) et doigt.
  import { onMount, tick } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { CATEGORIES, chercherEmojis, lireRecents, noterRecent, emojiConnu, nomEmoji, raccourcisActifs, reglerRaccourcis, suggestionsActives, reglerSuggestions, type Emoji, type IdCategorie } from '../../lib/emojis';

  let { onchoisir, onfermer, id = 'selecteur-emoji' }: { onchoisir: (e: string) => void; onfermer: () => void; id?: string } = $props();
  const tr = (k: string) => $t(k as any);
  const COLONNES = 8;
  let recents = $state<string[]>(lireRecents());
  let onglet = $state<'recent' | IdCategorie>(lireRecents().length ? 'recent' : 'smileys');
  let requete = $state('');
  let actif = $state(0);
  let raccourcis = $state(raccourcisActifs());
  let suggestions = $state(suggestionsActives());
  let recherche = $state<HTMLInputElement>();
  let grille = $state<HTMLDivElement>();

  const affiches = $derived<Emoji[]>(requete.trim() ? chercherEmojis(requete)
    : onglet === 'recent' ? recents.map((e) => emojiConnu(e)).filter((e): e is Emoji => !!e)
    : CATEGORIES.find((c) => c.id === onglet)?.emojis ?? []);
  const titre = $derived(requete.trim() ? tr('v2.circle.emoji.results') : tr(`v2.circle.emoji.cat.${onglet}`));

  // Sur écran tactile, ne pas donner le focus à la recherche : le clavier
  // virtuel surgirait et masquerait le sélecteur.
  const tactile = () => { try { return matchMedia('(hover: none)').matches; } catch { return false; } };
  onMount(() => { if (!tactile()) void tick().then(() => recherche?.focus({ preventScroll: true })); });

  function choisir(e: Emoji) { recents = noterRecent(e.e); if (onglet === 'recent' && !requete.trim()) actif = 0; onchoisir(e.e); }
  async function viser(i: number) {
    if (!affiches.length) return;
    actif = Math.max(0, Math.min(i, affiches.length - 1));
    await tick();
    grille?.querySelector<HTMLButtonElement>(`[data-index="${actif}"]`)?.focus();
  }
  function clavierGrille(ev: KeyboardEvent) {
    const pas: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLONNES, ArrowUp: -COLONNES };
    if (ev.key in pas) {
      ev.preventDefault();
      if (ev.key === 'ArrowUp' && actif < COLONNES) { recherche?.focus(); return; }
      void viser(actif + pas[ev.key]);
    } else if (ev.key === 'Home') { ev.preventDefault(); void viser(0); }
    else if (ev.key === 'End') { ev.preventDefault(); void viser(affiches.length - 1); }
  }
  function clavierRecherche(ev: KeyboardEvent) {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); void viser(0); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (affiches[0]) choisir(affiches[0]); }
  }
  function clavier(ev: KeyboardEvent) {
    // Échap ferme le SÉLECTEUR seulement, pas la fenêtre qui le contient.
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); onfermer(); }
  }
  function changerOnglet(o: 'recent' | IdCategorie) { onglet = o; requete = ''; actif = 0; }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div {id} class="selecteur" role="dialog" aria-label={tr('v2.circle.emoji.picker')} tabindex="-1" onkeydown={clavier}>
  <input bind:this={recherche} class="recherche" type="search" bind:value={requete} oninput={() => actif = 0} onkeydown={clavierRecherche} placeholder={tr('v2.circle.emoji.search')} aria-label={tr('v2.circle.emoji.search')} autocomplete="off" />
  <div class="onglets" role="toolbar" aria-label={tr('v2.circle.emoji.categories')}>
    {#if recents.length}<button type="button" aria-pressed={onglet === 'recent' && !requete.trim()} title={tr('v2.circle.emoji.cat.recent')} aria-label={tr('v2.circle.emoji.cat.recent')} onclick={() => changerOnglet('recent')}><span aria-hidden="true">🕘</span></button>{/if}
    {#each CATEGORIES as c (c.id)}
      <button type="button" aria-pressed={onglet === c.id && !requete.trim()} title={tr(`v2.circle.emoji.cat.${c.id}`)} aria-label={tr(`v2.circle.emoji.cat.${c.id}`)} onclick={() => changerOnglet(c.id)}><span aria-hidden="true">{c.icone}</span></button>
    {/each}
  </div>
  <p class="titre" aria-hidden="true">{titre}</p>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div bind:this={grille} class="grille" role="group" aria-label={titre} onkeydown={clavierGrille}>
    {#each affiches as e, i (e.e)}
      <button type="button" class="emoji" data-index={i} tabindex={i === actif ? 0 : -1} aria-label={nomEmoji(e, $locale)} title={nomEmoji(e, $locale)} onfocus={() => actif = i} onclick={() => choisir(e)}>{e.e}</button>
    {/each}
  </div>
  {#if !affiches.length}<p class="vide" role="status">{tr('v2.circle.emoji.none')}</p>{/if}
  <label class="raccourcis"><input type="checkbox" bind:checked={raccourcis} onkeydown={(ev) => { if (ev.key === 'Enter') ev.preventDefault(); }} onchange={() => reglerRaccourcis(raccourcis)} />{tr('v2.circle.emoji.shortcuts')}</label>
  <label class="raccourcis"><input data-option-suggestions type="checkbox" bind:checked={suggestions} onkeydown={(ev) => { if (ev.key === 'Enter') ev.preventDefault(); }} onchange={() => reglerSuggestions(suggestions)} />{tr('v2.circle.emoji.suggestions')}</label>
</div>

<style>
  .selecteur{--emoji-police:var(--font-primary,sans-serif),'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Segoe UI Symbol';display:flex;flex-direction:column;gap:6px;width:min(340px,100%);box-sizing:border-box;padding:8px;background:var(--v2-surface2);color:var(--v2-txt);border:1px solid var(--v2-line);border-radius:12px;font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .recherche{font:inherit;color:inherit;width:100%;box-sizing:border-box;border:1px solid var(--v2-line);background:var(--v2-bg);border-radius:8px;padding:6px 8px}
  .onglets{display:flex;gap:2px;flex-wrap:wrap}
  .onglets button{font-family:var(--emoji-police);font-size:calc(18px * var(--v2-txt-echelle, 1));line-height:1;padding:6px;border:0;border-radius:8px;background:transparent;cursor:pointer;min-width:36px;min-height:36px}
  .onglets button[aria-pressed='true']{background:var(--v2-active1)}
  .onglets button:hover,.emoji:hover{background:var(--v2-hover)}
  .titre{margin:2px 2px 0;font-size:calc(11px * var(--v2-txt-echelle, 1));color:var(--v2-txt2)}
  .grille{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:2px;max-height:216px;overflow:auto;overscroll-behavior:contain}
  .emoji{font-family:var(--emoji-police);font-size:calc(22px * var(--v2-txt-echelle, 1));line-height:1;aspect-ratio:1;min-width:0;min-height:34px;padding:0;border:0;border-radius:8px;background:transparent;cursor:pointer;color:inherit}
  .onglets button:focus-visible,.emoji:focus-visible,.recherche:focus-visible,.raccourcis input:focus-visible{outline:2px solid var(--v2-acc1);outline-offset:1px}
  .vide{margin:8px 2px;font-size:calc(12px * var(--v2-txt-echelle, 1));color:var(--v2-txt2)}
  .raccourcis{display:flex;gap:6px;align-items:center;font-size:calc(11px * var(--v2-txt-echelle, 1));color:var(--v2-txt2);padding-top:4px;border-top:1px solid var(--v2-line)}
  @media(max-width:699px){.selecteur{width:100%}.grille{max-height:180px}.emoji{min-height:40px}}
</style>
