<script lang="ts">
  /**
   * #2527 — une carte « thème » dans le fil Tune Circle : l'aperçu de ses
   * couleurs, et « Appliquer » qui passe par le juge d'un import (forme et
   * contraste WCAG AA) avant de ranger le thème dans le profil.
   */
  import { t } from '../../lib/i18n';
  import { themeDeCarte, type CarteTheme } from '../../lib/circleMessagerie';
  import { appliquerThemeRecu } from '../../lib/stores/monTheme';
  import { pairesIllisibles } from '../../lib/monTheme';

  let { carte }: { carte: CarteTheme } = $props();
  let occupe = $state(false);
  let etat = $state<{ texte: string; erreur: boolean } | null>(null);
  const tr = (k: string) => $t(k as any);
  const lisible = $derived(pairesIllisibles(carte.colors).length === 0);
  const c = (j: string) => carte.colors[j] ?? 'transparent';

  async function appliquer() {
    if (occupe) return;
    occupe = true;
    const messages = {
      applique: tr('monTheme.applique'), illisible: tr('monTheme.recuIllisible'),
      invalide: tr('monTheme.recuIllisible'), sans_greffon: tr('monTheme.recuSansGreffon'),
      erreur: tr('monTheme.erreurEnregistrement'),
    };
    try {
      const r = await appliquerThemeRecu(themeDeCarte(carte));
      etat = { texte: messages[r], erreur: r !== 'applique' };
    } catch {
      etat = { texte: messages.erreur, erreur: true };
    } finally {
      occupe = false;
    }
  }
</script>

<article class="carte-theme" data-carte-theme>
  <div class="apercu" style="background:{c('--v2-bg')};border-color:{c('--v2-line2')}">
    <div class="surface" style="background:{c('--v2-surface')}">
      <span style="color:{c('--v2-txt')}">{carte.title}</span>
      <span style="color:{c('--v2-txt2')}">{tr('monTheme.carteTitre')}</span>
    </div>
    <span class="accent" style="background:linear-gradient(90deg,{c('--v2-acc1')},{c('--v2-acc2')});color:{c('--v2-on-acc')}">{tr('monTheme.apercuBouton')}</span>
  </div>
  <div class="gestes">
    <button type="button" disabled={occupe || !lisible} onclick={appliquer}>{tr('monTheme.appliquer')}</button>
    {#if !lisible}<span class="erreur">{tr('monTheme.recuIllisible')}</span>{/if}
    {#if etat}<span class:erreur={etat.erreur} role="status">{etat.texte}</span>{/if}
  </div>
</article>

<style>
  .carte-theme{display:flex;flex-direction:column;gap:8px}
  .apercu{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid;border-radius:8px;min-width:220px}
  .surface{display:flex;flex-direction:column;gap:2px;padding:6px 10px;border-radius:6px;font-size:13px;flex:1}
  .accent{border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600}
  .gestes{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px}
  .erreur{color:var(--v2-danger)}
  button{font:inherit;border:1px solid var(--v2-line);background:var(--v2-bg);color:inherit;border-radius:6px;padding:6px 10px;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
</style>
