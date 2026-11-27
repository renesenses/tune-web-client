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
