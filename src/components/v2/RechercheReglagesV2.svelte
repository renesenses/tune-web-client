<script lang="ts">
  /**
   * #2735 — CHERCHER UN RÉGLAGE, à la manière des Réglages d'Apple : les
   * gestes, pas l'apparence.
   *
   * Un champ toujours visible en tête de l'écran Réglages. ⌘F / Ctrl+F et
   * « / » y placent le focus — jamais au détriment d'un champ où l'on est en
   * train d'écrire. Un résultat par RÉGLAGE (et non par section), avec son
   * chemin ; flèches, Entrée, Échap ; un clic ou Entrée confie le réglage à
   * l'écran (`onchoisir`), qui ouvre l'onglet, fait défiler et surligne.
   *
   * Accessibilité : motif « combobox + listbox » de l'ARIA APG — le focus
   * reste dans le champ, l'option active est désignée par
   * `aria-activedescendant`, et le nombre de résultats est annoncé.
   *
   * L'index et la recherche vivent dans `lib/reglagesIndex` : le menu avatar
   * lit le même.
   */
  import { t } from '../../lib/i18n';
  import { searchReglages, masqueAuNiveau, type Reglage, type ReglageHit } from '../../lib/reglagesIndex';
  import { LEVEL_LABEL_KEYS, type SettingsLevel } from '../../lib/uiLevel';
  import { estChampDeSaisie } from '../../lib/frappeVersRecherche';

  let { niveau, onchoisir }: { niveau: SettingsLevel; onchoisir: (r: Reglage) => void } = $props();

  let q = $state('');
  let ouvert = $state(false);
  let actif = $state(-1);
  let champ = $state<HTMLInputElement | undefined>();
  const uid = `rr-${Math.random().toString(36).slice(2, 8)}`;
  const idListe = `${uid}-liste`;
  const idOption = (i: number) => `${uid}-o${i}`;

  const hits = $derived<ReglageHit[]>(searchReglages(q, (k) => $t(k as any)));
  /** La saisie est assez longue pour chercher (même seuil que l'index). */
  const cherche = $derived(q.trim().length >= 2 || /[⺀-鿿가-힯぀-ヿ]/.test(q));
  const visible = $derived(ouvert && cherche);

  // Nouvelle saisie : le premier résultat redevient l'option active.
  $effect(() => { void q; actif = hits.length ? 0 : -1; });
  // L'option active reste dans le cadre quand on la déplace au clavier.
  $effect(() => {
    if (!visible || actif < 0) return;
    document.getElementById(idOption(actif))?.scrollIntoView?.({ block: 'nearest' });
  });

  const annonce = $derived.by(() => {
    if (!cherche) return '';
    if (!hits.length) return $t('settings.noSettingFound' as any).replace('{query}', q.trim());
    return hits.length === 1
      ? $t('reglages.recherche.unResultat' as any)
      : $t('reglages.recherche.nbResultats' as any).replace('{n}', String(hits.length));
  });

  function choisir(h: ReglageHit) {
    ouvert = false;
    onchoisir(h.reglage);
  }

  function clavier(e: KeyboardEvent) {
    if (e.isComposing) return;
    const n = hits.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!ouvert) { ouvert = true; return; }
      if (n) actif = (actif + 1) % n;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!ouvert) { ouvert = true; return; }
      if (n) actif = (actif - 1 + n) % n;
    } else if (e.key === 'Home' && visible && n) {
      e.preventDefault(); actif = 0;
    } else if (e.key === 'End' && visible && n) {
      e.preventDefault(); actif = n - 1;
    } else if (e.key === 'Enter') {
      if (visible && actif >= 0 && actif < n) { e.preventDefault(); choisir(hits[actif]); }
    } else if (e.key === 'Escape') {
      // Premier Échap : fermer la liste ; second : vider le champ.
      if (visible) { e.preventDefault(); ouvert = false; }
      else if (q) { e.preventDefault(); q = ''; }
    }
  }

  /**
   * Un champ où l'on écrit : le raccourci ne doit pas lui voler le focus.
   * Même règle que la frappe vers la recherche de la Bibliothèque
   * (`estChampDeSaisie`), à une exception près : une case, un bouton radio ou
   * un curseur qu'on vient de basculer n'est pas une saisie en cours — sans
   * quoi ⌘F cesserait de marcher après chaque interrupteur des Réglages.
   */
  const TYPES_SANS_SAISIE = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];
  function enSaisie(el: Element | null): boolean {
    if (!estChampDeSaisie(el)) return false;
    return !(el instanceof HTMLInputElement && TYPES_SANS_SAISIE.includes(el.type));
  }

  function raccourci(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing || !champ) return;
    const cmdF = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f';
    const barre = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (!cmdF && !barre) return;
    const focus = document.activeElement;
    if (focus === champ) {
      // Déjà ici : ⌘F resélectionne la saisie, « / » s'écrit normalement.
      if (cmdF) { e.preventDefault(); champ.select(); }
      return;
    }
    if (enSaisie(focus)) return;
    e.preventDefault();
    champ.focus();
    champ.select();
    ouvert = true;
  }
</script>

<svelte:window onkeydown={raccourci} />

<div class="rr" role="search">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
  <input
    bind:this={champ}
    bind:value={q}
    type="search"
    role="combobox"
    autocomplete="off"
    spellcheck="false"
    data-recherche-reglages
    aria-label={$t('settings.searchSetting' as any)}
    placeholder={$t('settings.searchSetting' as any)}
    aria-keyshortcuts="Meta+F Control+F /"
    aria-autocomplete="list"
    aria-expanded={visible}
    aria-controls={idListe}
    aria-activedescendant={visible && actif >= 0 ? idOption(actif) : undefined}
    onfocus={() => (ouvert = true)}
    onblur={() => (ouvert = false)}
    oninput={() => (ouvert = true)}
    onkeydown={clavier}
  />
  <ul class="rr-liste" id={idListe} role="listbox" aria-label={$t('settings.searchSetting' as any)} hidden={!visible}>
    {#if visible}
      {#each hits as h, i (h.reglage.id)}
        <!-- Le clavier passe par le champ (aria-activedescendant) : l'option
             n'a pas besoin de son propre gestionnaire de touches. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li id={idOption(i)} role="option" aria-selected={i === actif} class:actif={i === actif}
          data-resultat={h.reglage.id}
          onmousedown={(e) => e.preventDefault()}
          onmousemove={() => (actif = i)}
          onclick={() => choisir(h)}>
          <span class="rr-lib">{h.label}</span>
          <span class="rr-chemin">{h.chemin.slice(0, -1).join(' › ')}</span>
          {#if masqueAuNiveau(h.reglage, niveau)}
            <span class="rr-masque" data-masque-niveau>{$t('reglages.recherche.masque' as any)
              .replace('{niveau}', $t(LEVEL_LABEL_KEYS[h.niveau] as any))}</span>
          {/if}
        </li>
      {:else}
        <li class="rr-vide" role="option" aria-selected="false" aria-disabled="true">{annonce}</li>
      {/each}
    {/if}
  </ul>
  <span class="rr-annonce" role="status" aria-live="polite">{annonce}</span>
</div>

<style>
  .rr{position:relative; display:flex; align-items:center; width:min(380px, 100%); flex:0 1 380px}
  .rr svg{position:absolute; left:12px; width:15px; height:15px; color:var(--v2-txt3); pointer-events:none}
  .rr input{width:100%; height:38px; border-radius:10px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:0 12px 0 35px; outline:none}
  .rr input::placeholder{color:var(--v2-txt3)}
  .rr input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .rr-liste{position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:30; margin:0; padding:4px; list-style:none;
    max-height:min(420px, 60vh); overflow-y:auto; border-radius:12px; border:1px solid var(--v2-line2);
    background:var(--v2-bg); box-shadow:0 12px 32px var(--v2-sh-sm)}
  .rr-liste[hidden]{display:none}
  .rr-liste li{display:flex; flex-direction:column; gap:2px; padding:8px 10px; border-radius:8px; cursor:pointer; color:var(--v2-txt2)}
  .rr-liste li.actif{background:var(--v2-hover); color:var(--v2-txt)}
  .rr-lib{font-size:calc(13px * var(--v2-txt-echelle, 1)); font-weight:600; color:var(--v2-txt)}
  .rr-chemin{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .rr-masque{align-self:flex-start; margin-top:2px; font-size:calc(10.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2);
    border:1px solid var(--v2-line2); border-radius:6px; padding:1px 6px}
  .rr-liste li.rr-vide{cursor:default; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .rr-annonce{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  @media (max-width: 720px){ .rr{flex-basis:100%; width:100%} }
</style>
