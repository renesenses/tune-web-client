<script lang="ts">
  /**
   * DÉMO — le globe « lueur » de la maquette Discover de Levente (20/11/2026) :
   * sphère sombre, terres en pointillés lumineux, halo, lieux des membres qui
   * brillent, quelques étiquettes avec avatar.
   *
   * Technique : Canvas 2D, comme le moteur actuel (`lib/champCercle/moteur.ts`),
   * dont il réutilise la projection (`globe.ts` : `projeter`) et la grille de
   * terres embarquée (`pointsTerre.ts`, 4 160 points, world-atlas ISC). Aucune
   * bibliothèque : three.js n'est pas dans le dépôt, et une sphère de points
   * n'a pas besoin de WebGL.
   *
   * Couleurs : lues dans les jetons du thème (`--v2-acc1`, `--v2-acc-tint`,
   * `--v2-glow`, `--v2-surface`, `--v2-bg`), relues quand le thème change.
   *
   * Sobriété :
   * - `prefers-reduced-motion` : UNE image fixe, redessinée seulement quand la
   *   taille ou le thème changent ;
   * - sinon ~30 images/s par `boucleImages` (arrêt onglet caché) ET arrêt dès
   *   que le globe sort de l'écran (`IntersectionObserver`) ;
   * - trigonométrie des points précalculée une fois (Float32Array), aucune
   *   allocation par image ; densité de pixels plafonnée à 2.
   *
   * Accessibilité : la toile est décorative (`aria-hidden`) ; une liste
   * équivalente (masquée visuellement) nomme chaque lieu.
   */
  import { boucleImages } from '../../lib/boucleImages';
  import { decoderPointsTerre, projeter, DEG, type Orientation } from '../../lib/champCercle/globe';
  import { POINTS_TERRE } from '../../lib/champCercle/pointsTerre';
  import type { MembreDemo } from './donnees';

  interface Props {
    moi: MembreDemo;
    membres: MembreDemo[];
    /** Les membres nommés sur le globe (les autres brillent sans étiquette). */
    etiquetes: number[];
    libelle: string;
  }
  let { moi, membres, etiquetes, libelle }: Props = $props();

  // ── Terres : décodées UNE fois pour toutes les instances ─────────────────
  const TERRE = decoderPointsTerre(POINTS_TERRE);

  let hote = $state<HTMLDivElement | null>(null);
  let toile = $state<HTMLCanvasElement | null>(null);
  let W = $state(0);
  let H = $state(0);
  /** Incrémenté quand le thème change : l'image fixe se redessine. */
  let versionTheme = $state(0);
  /** Étiquettes posées par-dessus la toile (px CSS), `null` = face cachée. */
  let poses = $state<Record<number, { x: number; y: number; z: number } | null>>({});

  const tous = $derived([moi, ...membres]);
  const initiales = (n: string) => n.split(/\s+/).map((m) => m[0] ?? '').join('').slice(0, 2).toUpperCase();

  type Teintes = { acc: string; tint: string; glow: string; surface: string; fond: string };
  let teintes: Teintes = { acc: '#D89A63', tint: '#FFE2C4', glow: 'rgba(216,154,99,.22)', surface: '#2A211A', fond: '#17110D' };
  function lireTeintes() {
    if (!hote) return;
    const s = getComputedStyle(hote);
    const v = (k: string, d: string) => s.getPropertyValue(k).trim() || d;
    teintes = { acc: v('--v2-acc1', teintes.acc), tint: v('--v2-acc-tint', teintes.tint), glow: v('--v2-glow', teintes.glow),
      surface: v('--v2-surface', teintes.surface), fond: v('--v2-bg', teintes.fond) };
  }

  /** Centré sur l'Europe, le nord légèrement vers nous ; oscille de ±28° quand l'animation est permise. */
  const LON_CENTRE = 8 * DEG;
  const INCLINAISON = 0.32;
  function orientation(t: number, anime: boolean): Orientation {
    return { lon0: LON_CENTRE + (anime ? Math.sin(t * 0.00012) * 28 * DEG : 0), tilt: INCLINAISON };
  }

  function dessiner(ctx: CanvasRenderingContext2D, t: number, anime: boolean) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const R = Math.min(W, H) * 0.45;
    const cx = W / 2; const cy = H / 2;
    const o = orientation(t, anime);
    const k = R / 220; // échelle des points : le rendu reste le même de 390 à 1 440 px

    // 1. Halo extérieur, couleur de lueur du thème.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.32);
    halo.addColorStop(0, teintes.glow); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.32, 0, Math.PI * 2); ctx.fill();

    // 2. La sphère : surface éclairée en haut à gauche, fond du thème au limbe.
    const corps = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    corps.addColorStop(0, teintes.surface); corps.addColorStop(1, teintes.fond);
    ctx.fillStyle = corps; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // 3. Liseré lumineux du limbe.
    ctx.save();
    ctx.strokeStyle = teintes.acc; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2;
    ctx.shadowColor = teintes.acc; ctx.shadowBlur = 18 * k;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // 4. Terres en points : plus grands et plus clairs vers l'observateur.
    ctx.fillStyle = teintes.acc;
    for (let i = 0; i < TERRE.length; i++) {
      const [x, y, z] = projeter(TERRE[i][0], TERRE[i][1], R, cx, cy, o);
      if (z <= 0) continue;
      ctx.globalAlpha = 0.25 + 0.75 * z;
      const s = (1.0 + 1.6 * z) * k;
      ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill();
    }

    // 5. Les lieux des membres : lueur + cœur clair, pulsation douce si animé.
    const nouvelles: Record<number, { x: number; y: number; z: number } | null> = {};
    ctx.globalCompositeOperation = 'lighter';
    for (const m of tous) {
      const [x, y, z] = projeter(m.lat * DEG, m.lon * DEG, R, cx, cy, o);
      if (z <= 0.05) { nouvelles[m.id] = null; continue; }
      nouvelles[m.id] = { x, y, z };
      const p = anime ? 0.85 + 0.15 * Math.sin(t * 0.003 + m.id) : 1;
      const r = (m.id === moi.id ? 16 : 12) * k * p;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, teintes.tint); g.addColorStop(0.25, teintes.acc); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = z;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = teintes.tint; ctx.beginPath(); ctx.arc(x, y, 2.2 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    poses = nouvelles;
  }

  // Taille et thème.
  $effect(() => {
    if (!hote || !toile) return;
    lireTeintes();
    const ro = new ResizeObserver(([e]) => {
      W = Math.round(e.contentRect.width); H = Math.round(e.contentRect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      toile!.width = Math.max(1, W * dpr); toile!.height = Math.max(1, H * dpr);
    });
    ro.observe(hote);
    const mo = new MutationObserver(() => { lireTeintes(); versionTheme++; });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-v2-theme'] });
    return () => { ro.disconnect(); mo.disconnect(); };
  });

  // Rendu : une image fixe, ou la boucle tant que le globe est à l'écran.
  $effect(() => {
    if (!toile || W === 0 || H === 0) return;
    void versionTheme;
    const ctx = toile.getContext('2d');
    if (!ctx) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let arreter: (() => void) | null = null;
    const fixe = () => { arreter?.(); arreter = null; dessiner(ctx, 0, false); };
    const lancer = () => {
      if (mq.matches) { fixe(); return; }
      arreter ??= boucleImages((maintenant) => { dessiner(ctx, maintenant, true); return true; });
    };
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) lancer(); else { arreter?.(); arreter = null; }
    });
    io.observe(toile);
    const changement = () => (visible ? lancer() : undefined);
    mq.addEventListener('change', changement);
    dessiner(ctx, 0, false);
    lancer();
    return () => { io.disconnect(); mq.removeEventListener('change', changement); arreter?.(); };
  });
</script>

<div class="globe" bind:this={hote}>
  <canvas bind:this={toile} aria-hidden="true"></canvas>
  {#each tous.filter((m) => m.id === moi.id || etiquetes.includes(m.id)) as m (m.id)}
    {@const p = poses[m.id]}
    {#if p}
      <div class="etiquette" class:moi={m.id === moi.id} class:a-gauche={m.id === moi.id} style="left:{p.x}px; top:{p.y}px; opacity:{Math.min(1, p.z * 1.6)}" aria-hidden="true">
        <span class="txt"><strong>{m.nom.split(' ')[0]}</strong><span>{m.ville}, {m.pays}</span></span>
        <span class="av">{initiales(m.nom)}</span>
      </div>
    {/if}
  {/each}
  <ul class="sr-only" aria-label={libelle}>
    {#each tous as m (m.id)}<li>{m.nom} — {m.ville}, {m.pays}</li>{/each}
  </ul>
</div>

<style>
  .globe{position:relative; width:100%; height:100%; min-height:280px}
  canvas{position:absolute; inset:0; width:100%; height:100%; display:block}
  /* L'étiquette se pose au-dessus du point, à droite, comme sur la maquette. */
  .etiquette{position:absolute; transform:translate(10px, calc(-100% - 6px)); display:flex; align-items:center; gap:8px;
    padding:5px 6px 5px 10px; border-radius:var(--v2-r-card); border:1px solid var(--v2-line2);
    background:var(--v2-scrim); box-shadow:var(--v2-sh-card); pointer-events:none; white-space:nowrap}
  .etiquette.moi{border-color:var(--v2-acc2)}
  /* Mon étiquette part à gauche du point, celles des autres à droite : deux villes voisines ne se chevauchent pas. */
  .etiquette.a-gauche{transform:translate(calc(-100% - 10px), calc(-100% - 6px))}
  .txt{display:flex; flex-direction:column; line-height:1.2}
  .txt strong{font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  .txt span{font-size:calc(10.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .av{width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font-weight:700;
    font-size:calc(10px * var(--v2-txt-echelle, 1)); color:var(--v2-on-acc);
    background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2)); border:1px solid var(--v2-acc-tint)}
  .sr-only{position:absolute; width:1px; height:1px; padding:0; margin:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap}
</style>
