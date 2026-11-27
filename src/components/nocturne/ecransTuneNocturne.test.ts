// Nocturne, itération 5 (27/11/2026) — toute l'app suit le thème, profils dans
// le tiroir, cibles tactiles, icônes de zone.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attributsRacine, poserInterfaceSurRacine, iconesDeZoneActives } from '../../lib/interfaceSalon';

const ICI = __dirname;
const STYLES = join(ICI, '..', '..', 'styles', 'nocturne');
const lire = (...p: string[]) => readFileSync(join(...p), 'utf8');
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Les sélecteurs d'une liste, coupés aux virgules hors parenthèses. */
function auPremierNiveau(liste: string): string[] {
  const parts: string[] = [];
  let prof = 0, debut = 0;
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i];
    if (c === '(') prof++;
    else if (c === ')') prof--;
    else if (c === ',' && prof === 0) { parts.push(liste.slice(debut, i)); debut = i + 1; }
  }
  parts.push(liste.slice(debut));
  return parts;
}

describe('Nocturne — interface posée sur <html>', () => {
  function racine() {
    const a = new Map<string, string>();
    return {
      a,
      setAttribute: (k: string, v: string) => void a.set(k, v),
      removeAttribute: (k: string) => void a.delete(k),
    } as unknown as HTMLElement & { a: Map<string, string> };
  }
  it('l’interface et son thème (sombre par défaut)', () => {
    expect(attributsRacine('nocturne', 'clair')).toEqual({ interface: 'nocturne', theme: 'clair' });
    expect(attributsRacine('nocturne', undefined)).toEqual({ interface: 'nocturne', theme: 'sombre' });
  });
  it('pose data-nocturne-theme, jamais data-salon-theme, et retire tout au retour', () => {
    const r = racine();
    poserInterfaceSurRacine('roon-like', 'clair', r);
    poserInterfaceSurRacine('nocturne', 'sombre', r);
    expect(r.a.get('data-interface')).toBe('nocturne');
    expect(r.a.get('data-nocturne-theme')).toBe('sombre');
    expect(r.a.has('data-salon-theme')).toBe(false);
    poserInterfaceSurRacine('actuelle', null, r);
    expect(r.a.size).toBe(0);
  });
  it('ShellV2 pose Nocturne avec le thème partagé', () => {
    const shell = lire(ICI, '..', 'v2', 'ShellV2.svelte');
    expect(shell).toContain('poserInterfaceSurRacine($preferences.interfaceStyle, $themeNocturne)');
  });
});

describe('Nocturne — couche commune des écrans de Tune', () => {
  const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
  const selecteurs = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map((m) => m[1].trim())
    .filter((s) => s && !s.startsWith('@'))
    .flatMap((s) => auPremierNiveau(s).map((x) => x.trim()));
  it('chaque règle est limitée à Nocturne', () => {
    expect(selecteurs.length).toBeGreaterThan(30);
    for (const s of selecteurs) expect(s, s).toMatch(/^:root(\[data-v2-theme\])?\[data-interface="nocturne"\]/);
  });
  it('TESS garde sa structure : exclu de chaque règle de grammaire', () => {
    for (const s of selecteurs.filter((x) => x.includes('.noc-tune') && !x.includes('scrollbar') && !/\.noc-tune\s*$/.test(x))) {
      expect(s, s).toContain('.noc-tune:not([data-vue="tess"])');
    }
    for (const s of selecteurs.filter((x) => x.includes('[data-nocturne-theme] :is(.v2-shell, .tune-v2)') && !x.includes('.toast') && !x.includes('.modal-backdrop') && !x.includes('.dialog-btn.primary.danger'))) {
      expect(s, s).toContain('[data-vue="tess"] *');
    }
  });
  it('aucune couleur, taille, rayon ni ombre en dur : tout vient des jetons', () => {
    expect(css.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
    expect(css.match(/rgba?\(/g)).toBeNull();
    expect(css.match(/font-size:\s*(?:calc\()?\d/g)).toBeNull();
    expect(css.match(/border-radius:\s*\d+px/g)).toBeNull();
    expect(css.match(/box-shadow:\s*\d/g)).toBeNull();
  });
  it('la coquille la charge et nomme la vue montée (pour exclure TESS)', () => {
    const shell = lire(ICI, 'ShellNocturne.svelte');
    expect(shell).toContain("styles/nocturne/ecrans-tune.css");
    expect(shell).toContain('data-vue={$activeView}');
  });
  it('les jetons valent aussi sur <html>, en sombre et en clair', () => {
    const jetons = lire(STYLES, 'jetons-nocturne.css');
    expect(jetons).toContain(':root[data-interface="nocturne"] {');
    expect(jetons).toContain(':root[data-interface="nocturne"][data-nocturne-theme="clair"] {');
  });
});

describe('Nocturne — tiroir', () => {
  const tiroir = lire(ICI, 'TiroirNocturne.svelte');
  it('change de profil par la mécanique existante (Réglages › Profils)', () => {
    expect(tiroir).toContain("from '../../lib/basculeDeProfil'");
    expect(tiroir).toContain('retenirCoteServeur(id)');
    expect(tiroir).toContain('basculerVers(get(currentProfileId), id)');
    expect(tiroir).toContain('$visibleProfiles');
  });
  it('« Garder le panneau ouvert » n’apparaît pas au téléphone', () => {
    expect(tiroir).toMatch(/@media \(max-width: 600px\)\s*\{\s*\.noc-tiroir-epingle \{ display: none; \}/);
    expect(lire(ICI, 'ShellNocturne.svelte')).toContain('const epingleEffectif = $derived(tiroirEpingle && !etroit)');
  });
  it('rubriques à 44 px au moins au téléphone, après les paliers de hauteur', () => {
    const jetons = sansCommentaires(lire(STYLES, 'jetons-nocturne.css'));
    const telephone = jetons.lastIndexOf('@media (max-width: 600px)');
    expect(telephone).toBeGreaterThan(jetons.lastIndexOf('@media (max-height'));
    expect(jetons.slice(telephone)).toMatch(/--noc-hauteur-rubrique: 44px/);
  });
});

describe('Nocturne — icônes de zone de Rémi', () => {
  it('actives dans Nocturne (écran Zones), pas dans l’interface actuelle', () => {
    expect(iconesDeZoneActives('nocturne')).toBe(true);
    expect(iconesDeZoneActives('roon-like')).toBe(true);
    expect(iconesDeZoneActives('actuelle')).toBe(false);
  });
  it('le sélecteur de zone de la barre les montre', () => {
    const barre = lire(ICI, 'BarreLectureNocturne.svelte');
    expect(barre).toContain("import IconeZone from '../partages/IconeZone.svelte'");
    expect(barre.match(/<IconeZone zone=/g)?.length).toBe(2);
  });
});

describe('Nocturne — retours du 27/11 sur Réglages au téléphone', () => {
  const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
  it('la pile de bandeaux se pose au-dessus de la barre de lecture', () => {
    expect(css).toMatch(/\.toast-pile \{[^}]*bottom: calc\(var\(--noc-hauteur-barre\) \+ var\(--noc-ecart-bandeau\)\)/);
  });
  it('au téléphone, le nom du profil garde sa ligne (actions dessous)', () => {
    const tel = css.slice(css.lastIndexOf('@media (max-width: 600px)'));
    expect(tel).toMatch(/\.liste > \.profil > \.principal \{\s*flex: 1 0 100%;/);
  });
  it('le bouton « Remonter en haut » a sa réserve en bas, et se retire au téléphone', () => {
    expect(css).toMatch(/:is\(\.pane, \.scroll\) \{\s*padding-bottom: var\(--noc-reserve-remonter\);/);
    const tel = css.slice(css.lastIndexOf('@media (max-width: 600px)'));
    expect(tel).toMatch(/\[data-remonter-en-haut\] \{\s*display: none;/);
  });
});

describe('Nocturne — sélecteur de zone rangé par rubrique', async () => {
  const { zonesParRubrique, rubriqueDeZone } = await import('./zonesNocturne');
  it('sorties locales, lecteurs réseau, autres ; rubriques vides omises', () => {
    const z = [{ output_type: 'dlna' }, { output_type: 'local' }, { output_type: 'browser' }, { output_type: 'airplay' }] as any[];
    expect(zonesParRubrique(z).map((g) => [g.rubrique, g.zones.length])).toEqual([['locales', 1], ['reseau', 2], ['autres', 1]]);
    expect(zonesParRubrique([{ output_type: 'local' }] as any[]).map((g) => g.rubrique)).toEqual(['locales']);
    expect(rubriqueDeZone({ output_type: null } as any)).toBe('autres');
  });
});

describe('Nocturne — menu du profil', () => {
  it('le tiroir monte le menu de l’avatar de la coquille v2, tel quel', () => {
    const tiroir = lire(ICI, 'TiroirNocturne.svelte');
    expect(tiroir).toContain("import AvatarMenu from '../v2/AvatarMenu.svelte'");
    expect(tiroir).toMatch(/\{#if integree\}<span class="noc-tiroir-menu-profil"[^>]*><AvatarMenu \/><\/span>\{\/if\}/);
  });
  it('itération 6 : les palettes v2 retirées par la condition d’AvatarMenu (plus de CSS), la langue en un geste', () => {
    const menu = lire(ICI, '..', 'v2', 'AvatarMenu.svelte');
    expect(menu).toContain('{#if !salonActif($preferences.interfaceStyle) && !nocturneActif($preferences.interfaceStyle)}');
    expect(menu).toContain('data-avatar-langue');
    expect(menu).toMatch(/function choisirLangue\(l: Locale\) \{\s*preferences\.update\(\(pr\) => \(\{ \.\.\.pr, language: l, langueAuto: null \}\)\);\s*locale\.set\(l\);/);
    expect(lire(ICI, 'TiroirNocturne.svelte')).not.toContain('.avmenu .themes');
  });
});

describe('Nocturne — itération 6, lot 1', async () => {
  const { liaisonApres } = await import('./liaisonNocturne');
  it('la liaison suit les événements du client WebSocket', () => {
    expect(liaisonApres('inconnue', '_connected')).toBe('reliee');
    expect(liaisonApres('reliee', '_disconnected')).toBe('coupee');
    expect(liaisonApres('coupee', '_polling_started')).toBe('reliee');
    expect(liaisonApres('coupee', 'zone.updated')).toBe('coupee');
  });
  it('bandeau de reconnexion en haut au centre, sous l’en-tête', () => {
    const shell = lire(ICI, 'ShellNocturne.svelte');
    expect(shell).toContain('data-bandeau-liaison');
    expect(shell).toMatch(/\.noc-liaison \{[^}]*top: calc\(var\(--noc-hauteur-entete\) \+ var\(--noc-ecart-bandeau\)\);[^}]*left: 50%;/);
  });
  it('sélecteur de zone présent au téléphone (icône, 44 px) et segment multi-zone vers la Lecture groupée', () => {
    const barre = lire(ICI, 'BarreLectureNocturne.svelte');
    const etroit = barre.slice(barre.indexOf('@media (max-width: 900px)'));
    expect(etroit).not.toMatch(/\.noc-zone-ancre \{ display: none/);
    expect(etroit).toContain('min-height: var(--noc-cible-tactile)');
    expect(barre).toContain('<ZoneConfigModal');
    expect(barre).toContain('section="groupe"');
  });
  it('segment de tri actif doré', () => {
    const css = sansCommentaires(lire(STYLES, 'ecrans-tune.css'));
    expect(css).toMatch(/:is\(\.segment, \.seg, \.seg4\) > button:is\(\.on[^{]*\{\s*background: var\(--noc-ambre\);/);
  });
});
