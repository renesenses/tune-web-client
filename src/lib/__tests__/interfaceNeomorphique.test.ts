// Thème « Néomorphique » (itération 1, 26/11/2026) : registre, jetons,
// règles de la molette et des VU-mètres, et aucune valeur visuelle en dur.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INTERFACES, definitionInterface, salonActif, estJeuNeomorphique, iconesDeZoneActives,
  libellesThemeCoquille, attributsRacine,
} from '../interfaceSalon';
import { CHARGEURS_JETONS } from '../../components/salon/jetons';
import {
  angleMolette, valeurAuClavier, valeurAuGlisser, valeurALaRoulette, borner01,
  segmentsAllumes, segmentHaut, SEGMENTS_VU, ANGLE_MIN, ANGLE_MAX, PAS_MOLETTE,
  moletteAutorisee, cibleMolette,
} from '../../components/neomorphique/neomorphique';

const RACINE = join(__dirname, '..', '..');
const COMPOSANTS = join(RACINE, 'components', 'neomorphique');
const STYLES = join(RACINE, 'styles', 'neomorphique');
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('registre : le thème néomorphique', () => {
  it('est une entrée de la coquille Salon, avec son jeu de jetons chargeable', () => {
    const d = definitionInterface('neomorphique');
    expect(d.id).toBe('neomorphique');
    expect(d.coquille).toBe('salon');
    expect(d.jetons).toBe('neomorphique');
    expect(salonActif('neomorphique')).toBe(true);
    expect(CHARGEURS_JETONS.neomorphique).toBeTypeOf('function');
    expect(estJeuNeomorphique('neomorphique')).toBe(true);
    expect(estJeuNeomorphique('salon')).toBe(false);
  });
  it('vient après les interfaces existantes (l’actuelle reste la première)', () => {
    expect(INTERFACES[0].id).toBe('actuelle');
    expect(INTERFACES.map((i) => i.id)).toContain('neomorphique');
  });
  it('libellé et aide traduits dans les 20 langues, anglais « Neumorphic »', () => {
    const dossier = join(RACINE, 'lib', 'locales');
    const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(fichiers.length).toBeGreaterThanOrEqual(20);
    for (const f of fichiers) {
      const src = readFileSync(join(dossier, f), 'utf8');
      expect(src, f).toContain('"neomorphique.reglage.neomorphique":');
      expect(src, f).toContain('"neomorphique.reglage.neomorphiqueAide":');
    }
    expect(readFileSync(join(dossier, 'en.ts'), 'utf8')).toContain('"neomorphique.reglage.neomorphique": "Neumorphic"');
  });
});

describe('jetons néomorphiques', () => {
  const jetons = sansCommentaires(readFileSync(join(STYLES, 'jetons-neomorphique.css'), 'utf8'));
  it('définit les jetons du brief, en clair ET en sombre', () => {
    for (const j of ['--neo-sol', '--neo-lumiere', '--neo-ombre', '--neo-relief-1', '--neo-relief-2',
      '--neo-relief-3', '--neo-creux-1', '--neo-creux-2', '--neo-etat']) {
      expect(jetons, j).toContain(`${j}:`);
    }
    const sombre = jetons.split('[data-salon-theme="sombre"]').at(-1) ?? '';
    for (const j of ['--neo-sol', '--neo-lumiere', '--neo-ombre', '--neo-etat']) {
      expect(sombre, `${j} (sombre)`).toContain(`${j}:`);
    }
  });
  it('aucune teinte littérale : tout lit la palette de fondations.css', () => {
    expect(jetons.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[0-9.]/g)).toBeNull();
    const fondations = readFileSync(join(RACINE, 'styles', 'fondations.css'), 'utf8');
    for (const m of jetons.matchAll(/var\((--pal-[a-z0-9-]+)\)/g)) {
      expect(fondations, m[1]).toContain(`${m[1]}:`);
    }
  });
});

describe('aucun visuel en dur dans les composants et la feuille de relief', () => {
  const fichiers = readdirSync(COMPOSANTS).filter((f) => f.endsWith('.svelte'));
  it.each(fichiers)('%s — ni couleur, ni taille de texte, ni rayon, ni ombre littéraux', (f) => {
    const style = sansCommentaires(readFileSync(join(COMPOSANTS, f), 'utf8').split('<style>')[1] ?? '');
    expect(style.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g), 'couleur en dur').toBeNull();
    expect(style.match(/font-size:\s*(?:calc\()?\d/g), 'taille de texte en dur').toBeNull();
    expect(style.match(/border-radius:\s*\d+px/g), 'rayon en dur').toBeNull();
    expect(style.match(/box-shadow:\s*(?:inset\s+)?\d/g), 'ombre en dur').toBeNull();
  });
  it('les ombres ne sont jamais animées', () => {
    const tout = [
      ...fichiers.map((f) => readFileSync(join(COMPOSANTS, f), 'utf8').split('<style>')[1] ?? ''),
      readFileSync(join(STYLES, 'relief.css'), 'utf8'),
    ].map(sansCommentaires).join('\n');
    expect(tout.match(/transition[^;]*(box-shadow|all)/g)).toBeNull();
  });
  it('relief.css : aucune couleur ni ombre littérale', () => {
    const css = sansCommentaires(readFileSync(join(STYLES, 'relief.css'), 'utf8'));
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)).toBeNull();
    expect(css.match(/box-shadow:\s*(?:inset\s+)?\d/g)).toBeNull();
  });
  it('l’état enfoncé porte la couleur d’état, pas seulement le creux', () => {
    const css = sansCommentaires(readFileSync(join(STYLES, 'relief.css'), 'utf8'));
    const bloc = css.match(/[^{}]*\[aria-pressed="true"\][^{}]*\{([^}]*)\}/)?.[1] ?? '';
    expect(bloc).toContain('var(--neo-creux-1)');
    expect(bloc).toContain('color: var(--neo-etat)');
  });
});

describe('molette de volume', () => {
  it('course de −135° à +135°', () => {
    expect(angleMolette(0)).toBe(ANGLE_MIN);
    expect(angleMolette(1)).toBe(ANGLE_MAX);
    expect(angleMolette(0.5)).toBe(0);
    expect(angleMolette(4)).toBe(ANGLE_MAX);
  });
  it('clavier : flèches, Page, Début, Fin ; les autres touches ne règlent rien', () => {
    expect(valeurAuClavier(0.4, 'ArrowUp')).toBeCloseTo(0.4 + PAS_MOLETTE);
    expect(valeurAuClavier(0.4, 'ArrowRight')).toBeCloseTo(0.4 + PAS_MOLETTE);
    expect(valeurAuClavier(0.4, 'ArrowDown')).toBeCloseTo(0.4 - PAS_MOLETTE);
    expect(valeurAuClavier(0.4, 'PageUp')).toBeCloseTo(0.5);
    expect(valeurAuClavier(0.4, 'Home')).toBe(0);
    expect(valeurAuClavier(0.4, 'End')).toBe(1);
    expect(valeurAuClavier(0.99, 'ArrowUp')).toBe(1);
    expect(valeurAuClavier(0.4, 'a')).toBeNull();
  });
  it('glisser vers le haut monte, borné à 0..1', () => {
    expect(valeurAuGlisser(0.5, 16)).toBeGreaterThan(0.5);
    expect(valeurAuGlisser(0.5, -16)).toBeLessThan(0.5);
    expect(valeurAuGlisser(0.9, 1000)).toBe(1);
    expect(valeurAuGlisser(0.1, -1000)).toBe(0);
  });
  it('roulette : un cran vers le haut monte d’un pas', () => {
    expect(valeurALaRoulette(0.4, -100)).toBeCloseTo(0.4 + PAS_MOLETTE);
    expect(valeurALaRoulette(0.4, 3)).toBeCloseTo(0.4 - PAS_MOLETTE);
    expect(valeurALaRoulette(0.4, 0)).toBe(0.4);
    expect(borner01(Number.NaN)).toBe(0);
  });
});

describe('VU-mètres à segments', () => {
  it('silence éteint, pleine échelle allume tout', () => {
    expect(segmentsAllumes(-96)).toBe(0);
    expect(segmentsAllumes(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(segmentsAllumes(0)).toBe(SEGMENTS_VU);
    expect(segmentsAllumes(-24)).toBe(SEGMENTS_VU / 2);
  });
  it('seuls les segments au-dessus de −6 dBFS sont « hauts »', () => {
    expect(segmentHaut(SEGMENTS_VU - 1)).toBe(true);
    expect(segmentHaut(0)).toBe(false);
    expect(segmentHaut(SEGMENTS_VU - 3)).toBe(false);
  });
});

/** Les sélecteurs d'une liste, découpée aux virgules de premier niveau. */
function selecteurs(liste: string): string[] {
  const out: string[] = [];
  let prof = 0, debut = 0;
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i];
    if (c === '(') prof++;
    else if (c === ')') prof--;
    else if (c === ',' && prof === 0) { out.push(liste.slice(debut, i)); debut = i + 1; }
  }
  out.push(liste.slice(debut));
  return out.map((x) => x.trim()).filter(Boolean);
}

describe('itération 2 : toute l’app suit le thème', () => {
  const couche = sansCommentaires(readFileSync(join(STYLES, 'ecrans-tune.css'), 'utf8'));
  const regles = [...couche.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), decl: m[2] }))
    .filter((r) => !r.sel.startsWith('@'));
  it('la racine porte data-interface="neomorphique" (calques hors coquille compris)', () => {
    expect(attributsRacine('neomorphique', 'sombre')).toEqual({ interface: 'neomorphique', theme: 'sombre' });
  });
  it('chaque règle de la couche commune est limitée au thème néomorphique', () => {
    expect(regles.length).toBeGreaterThan(40);
    for (const r of regles) {
      for (const s of selecteurs(r.sel)) {
        expect(s.trim(), s).toMatch(/^:root\[data-interface="neomorphique"\]/);
      }
    }
  });
  it('TESS garde sa structure : la couche des écrans l’exclut', () => {
    for (const r of regles.filter((x) => x.sel.includes('.vue-tune') && !x.sel.includes('[data-vue="settings"]') && !x.sel.includes('::-webkit'))) {
      expect(r.sel, r.sel).toContain('[data-vue="tess"]');
    }
  });
  it('aucune couleur ni ombre littérale, aucune ombre animée', () => {
    expect(couche.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[0-9.]/g)).toBeNull();
    expect(couche.match(/box-shadow:\s*(?:inset\s+)?\d/g)).toBeNull();
    expect(couche.match(/transition[^;]*(box-shadow|all)/g)).toBeNull();
  });
  it('onglet choisi, puce allumée, segment choisi : la couleur d’état accompagne le relief', () => {
    const etats = regles.filter((r) => /aria-selected="true"|aria-pressed="true"|\.on\b/.test(r.sel) && /--neo-creux-1|--neo-relief-1/.test(r.decl));
    expect(etats.length).toBeGreaterThan(3);
    for (const r of etats) expect(r.decl, r.sel).toContain('var(--neo-etat)');
  });
  it('la couche est chargée avec les jetons, pas pour les autres thèmes', () => {
    const src = readFileSync(join(RACINE, 'components', 'salon', 'jetons.ts'), 'utf8');
    expect(src).toContain("styles/neomorphique/ecrans-tune.css");
  });
  it('icônes de zone de Rémi actives dans Néomorphique', () => {
    expect(iconesDeZoneActives('neomorphique')).toBe(true);
    expect(iconesDeZoneActives('actuelle')).toBe(false);
    const zones = readFileSync(join(COMPOSANTS, 'ZonesNeomorphique.svelte'), 'utf8');
    expect(zones).toContain('<IconeZone');
  });
  it('le réglage clair / sombre porte le nom du thème choisi', () => {
    expect(libellesThemeCoquille('neomorphique').titre).toBe('neomorphique.reglage.theme');
    expect(libellesThemeCoquille('roon-like').titre).toBe('roonLike.reglage.theme');
  });
});

describe('itération 3 : pages de la coquille et tablettes', () => {
  const couche = sansCommentaires(readFileSync(join(STYLES, 'ecrans-tune.css'), 'utf8'));
  const jetons = sansCommentaires(readFileSync(join(STYLES, 'jetons-neomorphique.css'), 'utf8'));
  it('les briques Roon-like des pages (Lire maintenant, ronds, onglets, puces) deviennent des touches', () => {
    for (const brique of ['[data-bouton-lire]', '.s-rond', '.s-onglets button', '.s-puce']) {
      expect(couche, brique).toContain(brique);
    }
    const choisi = couche.match(/\.s-onglets button\[aria-selected="true"\][^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(choisi).toContain('var(--neo-creux-1)');
    expect(choisi).toContain('var(--neo-etat)');
  });
  it('au doigt, une touche fait au moins 44 px', () => {
    const tactile = jetons.split('@media (pointer: coarse)')[1] ?? '';
    expect(tactile).toMatch(/--neo-cible:\s*44px/);
    expect(readFileSync(join(STYLES, 'relief.css'), 'utf8')).toContain('min-height: var(--neo-cible)');
  });
});

describe('itération 3 : la barre latérale, un panneau en relief', () => {
  const couche = sansCommentaires(readFileSync(join(STYLES, 'ecrans-tune.css'), 'utf8'));
  const B = ':root[data-interface="neomorphique"] .salon nav.barre';
  const regle = (suffixe: string) => {
    const i = couche.indexOf(`${B}${suffixe} {`);
    expect(i, suffixe).toBeGreaterThan(-1);
    return couche.slice(i, couche.indexOf('}', i));
  };
  it('d’un seul tenant, en relief, sans le filet de Roon-like', () => {
    const r = regle('');
    expect(r).toContain('box-shadow: var(--neo-relief-2)');
    expect(r).toContain('border: 0');
  });
  it('l’entrée ouverte : creux, couleur d’état et index — jamais l’ombre seule', () => {
    const r = regle(' li button:is(.on, [aria-current="page"])');
    expect(r).toContain('var(--neo-creux-1)');
    expect(r).toContain('color: var(--neo-etat)');
    expect(regle(' li button:is(.on, [aria-current="page"])::before')).toContain('var(--neo-etat-fond)');
  });
  it('cibles de 44 px au doigt ; listes de lecture sur une ligne, ellipse, icône à gauche', () => {
    expect(regle(' li button')).toContain('var(--neo-cible)');
    expect(couche).toMatch(/nav\.barre \.liste svg \{ order: -1;/);
    expect(couche).not.toMatch(/-webkit-line-clamp/);
  });
});

describe('itération 5 : accueil, page Genre, temps du transport', () => {
  const couche = sansCommentaires(readFileSync(join(STYLES, 'ecrans-tune.css'), 'utf8'));
  it('les encarts de l’accueil sont en relief, les cartes d’album restent plates', () => {
    expect(couche).toContain('[data-page-salon="accueil"] .plus-tard');
    expect(couche).toContain('.carte:not([data-carte-album])');
    expect(couche).not.toMatch(/\[data-page-salon="accueil"\] \.carte,/);
  });
  it('page Genre : bandeau et mosaïque en relief', () => {
    expect(couche).toMatch(/\[data-page-salon="genre"\] \.heros \{[^}]*--neo-relief-2/);
    expect(couche).toMatch(/\[data-page-salon="genre"\] \.tuile \{[^}]*--neo-relief-1/);
  });
  it('les temps du transport sont dans la police du thème, en chiffres tabulaires', () => {
    const src = readFileSync(join(COMPOSANTS, 'TransportNeomorphique.svelte'), 'utf8');
    expect(src).toMatch(/\.time\) \{ font-family: var\(--s-police-texte\); font-variant-numeric: tabular-nums;/);
  });
});

describe('itération 9 : accessibilité alignée sur Roon-like', () => {
  const couche = sansCommentaires(readFileSync(join(STYLES, 'ecrans-tune.css'), 'utf8'));
  const jetons = sansCommentaires(readFileSync(join(STYLES, 'jetons-neomorphique.css'), 'utf8'));
  it('l’anneau de focus ne s’affiche qu’au clavier, à la couleur d’état', () => {
    expect(couche).not.toMatch(/:focus\s*[,{]/);
    expect(couche).toMatch(/:focus-visible \{\s*outline: var\(--neo-anneau\) solid var\(--neo-etat\)/);
  });
  it('44 px au doigt, aussi sur une tablette sans survol', () => {
    expect(jetons).toMatch(/@media \(pointer: coarse\), \(max-width: 1366px\) and \(hover: none\) \{[^}]*--neo-cible:\s*44px/);
    expect(jetons).toMatch(/--s-cible-doigt:\s*44px/);
  });
  it('gestionnaire de playlists : filtre actif enfoncé et à la couleur d’état', () => {
    expect(couche).toMatch(/\.filter-chip\.active \{[^}]*--neo-creux-1[^}]*--neo-etat/);
  });
});

describe('itération 10 : SÉCURITÉ AUDITIVE — la molette ne dépasse jamais le curseur', () => {
  const plafonnee = { id: 1, output_type: 'local', volume_limit_safety: 0.6 };
  it('Fin sur une zone plafonnée à 60 % → 60 %, jamais 100', () => {
    const fin = valeurAuClavier(0.4, 'End')!;
    expect(fin).toBe(1);
    expect(cibleMolette(plafonnee, fin, 0.4)).toBeCloseTo(0.6);
  });
  it('Page↑, roulette et glisser butent au même plafond', () => {
    expect(cibleMolette(plafonnee, valeurAuClavier(0.58, 'PageUp')!, 0.58)).toBeCloseTo(0.6);
    expect(cibleMolette(plafonnee, valeurALaRoulette(0.6, -100), 0.6)).toBeCloseTo(0.6);
    expect(cibleMolette(plafonnee, valeurAuGlisser(0.4, 10_000), 0.4)).toBeCloseTo(0.6);
  });
  it('limite de confort : la molette s’y arrête tant que le volume est dessous', () => {
    const zone = { id: 1, output_type: 'local', volume_limit_safety: 0.8, volume_limit_comfort: 0.5 };
    expect(cibleMolette(zone, 1, 0.3)).toBeCloseTo(0.5);
    // Au-dessus du confort (monté par les boutons), la sécurité seule borne.
    expect(cibleMolette(zone, 1, 0.6)).toBeCloseTo(0.6);
  });
  it('refus : volume verrouillé (PURE), volume fixe, sortie non réglable', () => {
    expect(moletteAutorisee(plafonnee, false)).toBe(true);
    expect(moletteAutorisee(plafonnee, true)).toBe(false);
    expect(moletteAutorisee({ ...plafonnee, fixed_volume: true }, false)).toBe(false);
    expect(moletteAutorisee({ ...plafonnee, output_capabilities: { can_set_volume: false } } as any, false)).toBe(false);
    expect(moletteAutorisee(null, false)).toBe(false);
  });
  it('même expression que le curseur actuel, et la molette l’emploie', () => {
    const curseur = readFileSync(join(RACINE, 'components', 'partages', 'VolumeControl.svelte'), 'utf8');
    expect(curseur).toContain('normaliserVolumeSortie(zone, bornerCurseur(zone, brut, vol), plafondDuCurseur(zone, vol))');
    expect(curseur).toMatch(/volumeAutorise = \$derived\(!\$volumeLocked && volumeCommandable\(zone\)\)/);
    const regles = readFileSync(join(COMPOSANTS, 'neomorphique.ts'), 'utf8');
    expect(regles).toContain('normaliserVolumeSortie(zone, bornerCurseur(zone, brut, actuel), plafondDuCurseur(zone, actuel))');
    const molette = readFileSync(join(COMPOSANTS, 'MoletteNeomorphique.svelte'), 'utf8');
    expect(molette).toContain('cibleMolette(z, brut, vol)');
    expect(molette).toContain('moletteAutorisee(zone, $volumeLocked)');
    expect(molette).toContain('envoyerVolumeOuReverrouiller');
    expect(molette).toContain('envoyer: reglerVolume');
  });
});

