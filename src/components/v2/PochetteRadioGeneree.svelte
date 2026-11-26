<script lang="ts">
  /**
   * Pochette générée d'une station sans logo — harmonisation de l'interface
   * (rc14, maquette `radios.html` validée par Bertrand le 26/11).
   *
   * Elle remplace la grande lettre seule (« C », « R ») qu'affichait le repli
   * d'`AlbumArt` : un fond aux couleurs de Tune, des ondes concentriques qui
   * partent du coin bas droit, les initiales en haut et le nom en bas. Tout
   * se lit dans les jetons du thème (accent, surface, texte) : elle suit le
   * thème sombre comme le clair, sans couleur écrite en dur.
   */
  import { initialesStation } from '../../lib/mesRadios';

  let { nom }: { nom: string } = $props();
  const initiales = $derived(initialesStation(nom));
</script>

<span class="gen" data-testid="radio-pochette-generee" role="img" aria-label={nom}>
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <circle class="point" cx="88" cy="88" r="5" />
    <circle cx="88" cy="88" r="16" />
    <circle cx="88" cy="88" r="28" />
    <circle cx="88" cy="88" r="41" />
    <circle cx="88" cy="88" r="55" />
  </svg>
  <!-- Initiales et nom en bas à gauche : le coin haut gauche est celui du cœur
       (`PochetteActions`), les ondes partent du coin bas droit. -->
  <span class="texte" aria-hidden="true">
    <span class="ini">{initiales}</span>
    <span class="nom-gen" title={nom}>{nom}</span>
  </span>
</span>

<style>
  .gen{position:absolute; inset:0; display:block; overflow:hidden;
    background:radial-gradient(120% 120% at 90% 90%,
      color-mix(in srgb, var(--v2-acc1) 30%, var(--v2-surface)) 0%,
      color-mix(in srgb, var(--v2-acc1) 12%, var(--v2-surface)) 35%,
      var(--v2-surface) 75%)}
  svg{position:absolute; inset:0; width:100%; height:100%; fill:none; stroke:var(--v2-acc1); stroke-width:.9; opacity:.55}
  .point{fill:var(--v2-acc1); stroke:none; opacity:.9}
  .texte{position:absolute; left:8%; right:30%; bottom:8%; display:flex; flex-direction:column; gap:6px}
  .ini{font:var(--graisse-grasse) var(--taille-8) var(--police-texte); letter-spacing:-.02em; line-height:1; color:var(--v2-acc-tint)}
  .nom-gen{font:var(--graisse-forte) var(--taille-3)/1.25 var(--police-texte); color:var(--v2-txt);
    display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}
</style>
