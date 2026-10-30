import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { V2_JETONS } from '../v2Jetons';
import {
  JETONS_MON_THEME, LIBELLES_JETONS, LIBELLES_GROUPES, GROUPES_MON_THEME,
  jugerTheme, formeDuTheme, pairesIllisibles, contraste, cssDuTheme, jetonsDuTheme,
  familleDuTheme, routeThemeWeb, etatGreffonMonTheme, texteExport, nomDeFichier, lireTheme,
  versHex, appliquerMonTheme, ATTRIBUT_MON_THEME, type ThemePerso,
} from '../monTheme';
import { adresseDuTheme, enregistrementDe } from '../stores/monTheme';
import * as LANGUES from './lesOnzeLangues';

// #2527 — « Mon thème » : le format, les juges (forme, lisibilité WCAG AA),
// la feuille appliquée, la découverte du greffon, l'export / import.

/** Le thème « Mozaiklabs (logo) » de #2520 : lisible par construction. */
function lisible(): ThemePerso {
  return {
    format: 'tune-theme', version: 1, name: 'Nuit verte',
    colors: {
      '--v2-bg': '#000000', '--v2-bg2': '#080A09', '--v2-surface': '#1F2321',
      '--v2-surface2': '#151817', '--v2-hover': '#101312',
      '--v2-txt': '#FFFFFF', '--v2-txt2': '#D2D8D5', '--v2-txt3': '#A9B1AD',
      '--v2-acc1': '#2A9F5B', '--v2-acc2': '#28BA9B', '--v2-acc-tint': '#E4F9D8',
      '--v2-on-acc': '#000000', '--v2-line': '#2B302D', '--v2-line2': '#3A413D',
      '--v2-active1': '#0F2A1B', '--v2-active2': '#0A1A12', '--v2-player1': '#050606',
      '--v2-player2': '#000000', '--v2-danger': '#FF8F87', '--v2-danger-bd': '#FF6B6B',
    },
  };
}
const avec = (j: string, v: unknown) => { const t = lisible() as any; t.colors[j] = v; return t; };

describe('#2527 — les jetons de « Mon thème »', () => {
  it('sont ceux de V2_JETONS, sauf --v2-danger-soft (dérivé)', () => {
    const tous = Object.values(V2_JETONS).flat() as string[];
    expect(JETONS_MON_THEME).toEqual(tous.filter((j) => j !== '--v2-danger-soft'));
    expect(JETONS_MON_THEME).toHaveLength(20);
  });

  it('🔴 la liste est celle que le serveur juge (plugins/tune-mon-theme/src/theme.rs)', () => {
    // Copie volontaire : les deux dépôts doivent dire la même chose. Changer
    // l'un sans l'autre fait refuser par le serveur tout thème du client.
    expect([...JETONS_MON_THEME]).toEqual([
      '--v2-bg', '--v2-bg2', '--v2-surface', '--v2-surface2', '--v2-hover',
      '--v2-txt', '--v2-txt2', '--v2-txt3',
      '--v2-acc1', '--v2-acc2', '--v2-acc-tint', '--v2-on-acc',
      '--v2-line', '--v2-line2',
      '--v2-active1', '--v2-active2', '--v2-player1', '--v2-player2', '--v2-danger', '--v2-danger-bd',
    ]);
  });

  it('chaque jeton et chaque groupe a un libellé dans les quinze langues', () => {
    const dicos = Object.entries(LANGUES) as [string, Record<string, string>][];
    expect(dicos.length).toBeGreaterThanOrEqual(14);
    const cles = [
      ...JETONS_MON_THEME.map((j) => LIBELLES_JETONS[j]),
      ...GROUPES_MON_THEME.map((g) => LIBELLES_GROUPES[g.groupe]),
    ];
    expect(cles.every(Boolean)).toBe(true);
    for (const [langue, d] of dicos) for (const k of cles) expect(d[k], `${langue} : ${k}`).toBeTruthy();
  });
});

describe('#2527 — le juge de lisibilité (WCAG AA)', () => {
  it('le thème du logo (#2520) est lisible', () => {
    expect(pairesIllisibles(lisible().colors)).toEqual([]);
    expect(jugerTheme(lisible()).ok).toBe(true);
  });

  it('🔴 un texte atténué gris foncé est refusé, avec chaque fond en cause', () => {
    const j = jugerTheme(avec('--v2-txt3', '#333333'));
    expect(j.ok).toBe(false);
    const paires = 'illisible' in j ? j.illisible : [];
    expect(paires).toHaveLength(V2_JETONS.fonds.length);
    for (const p of paires) {
      expect(p.texte).toBe('--v2-txt3');
      expect(p.ratio).toBeLessThan(4.5);
      expect(p.minimum).toBe(4.5);
    }
  });

  it('🔴 le texte posé SUR l’accent est jugé aux deux extrémités', () => {
    const j = jugerTheme(avec('--v2-on-acc', '#2A9F5B'));
    const paires = 'illisible' in j ? j.illisible : [];
    expect(paires.map((p) => `${p.texte}/${p.fond}`)).toEqual(
      expect.arrayContaining(['--v2-on-acc/--v2-acc1', '--v2-on-acc/--v2-acc2']),
    );
  });

  it('la fin du dégradé n’a besoin que de 3:1 (remplissage)', () => {
    // #21876A sur la surface #1F2321 ≈ 3,6:1 : assez pour un remplissage, pas pour un texte.
    expect(contraste('#21876A', '#1F2321')).toBeGreaterThan(3);
    expect(contraste('#21876A', '#1F2321')).toBeLessThan(4.5);
    expect(pairesIllisibles(avec('--v2-acc2', '#21876A').colors)).toEqual([]);
    // Le même vert en TEXTE (accent) ne passe pas.
    expect(pairesIllisibles(avec('--v2-acc1', '#21876A').colors).length).toBeGreaterThan(0);
  });

  it('noir sur blanc vaut 21:1', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
  });
});

describe('#2527 — le juge de forme', () => {
  it.each([
    ['format', { format: 'autre' }],
    ['version', { version: 2 }],
    ['name', { name: '' }],
    ['name', { name: 'x'.repeat(61) }],
    ['colors', { colors: [] }],
  ])('refuse un thème sans %s valable', (champ, patch) => {
    expect(jugerTheme({ ...lisible(), ...patch })).toEqual({ ok: false, champ });
  });

  it.each(['#FFF', 'red', '#12345G', '#000000;}body{x:y', 'url(javascript:x)', 0])(
    '🔴 refuse la couleur %s, par son jeton (rien n’entre dans la feuille)',
    (v) => {
      expect(jugerTheme(avec('--v2-bg2', v))).toEqual({ ok: false, champ: '--v2-bg2' });
    },
  );

  it('refuse un jeton manquant ou inconnu', () => {
    const t = lisible() as any; delete t.colors['--v2-line'];
    expect(jugerTheme(t)).toEqual({ ok: false, champ: '--v2-line' });
    expect(jugerTheme(avec('--v2-danger-soft', '#FF0000'))).toEqual({ ok: false, champ: '--v2-danger-soft' });
  });

  it('normalise : couleurs en capitales, nom nettoyé', () => {
    const t = { ...avec('--v2-txt', '#ffffff'), name: '  Nuit\u0007  verte ' };
    const f = formeDuTheme(t);
    expect(f.ok && f.theme.colors['--v2-txt']).toBe('#FFFFFF');
    expect(f.ok && f.theme.name).toBe('Nuit verte');
  });
});

describe('#2527 — la feuille appliquée', () => {
  it('🔴 pose TOUS les jetons de V2_JETONS (la garde de #2520 l’exige de chaque thème)', () => {
    const j = jetonsDuTheme(lisible().colors);
    for (const n of Object.values(V2_JETONS).flat()) expect(j[n], n).toBeTruthy();
    expect(j['--v2-danger-soft']).toBe('rgba(255,143,135,0.12)');
  });

  it('l’emporte sur les palettes : sélecteur (0,4,0) contre (0,3,0)', () => {
    const css = cssDuTheme(lisible());
    expect(css.startsWith(`:root[data-v2-theme][${ATTRIBUT_MON_THEME}] .tune-v2{`)).toBe(true);
    expect(css).toContain('--v2-body-bg:#000000;');
    // Que des #RRGGBB et des rgba() construits ici.
    const valeurs = [...css.matchAll(/:([^;{}]+);/g)].map((m) => m[1]);
    for (const v of valeurs) expect(v).toMatch(/^(#[0-9A-F]{6}|rgba\(\d+,\d+,\d+,[\d.]+\))$/);
  });

  it('les palettes standard sont réellement plus faibles (0,3,0) dans tune-v2.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/tune-v2.css'), 'utf-8');
    expect(css).toContain(':root[data-v2-theme="clear-white"] .tune-v2{');
    expect(css).not.toContain(ATTRIBUT_MON_THEME);
  });

  it('famille : fond clair → clear-white, fond sombre → black-green', () => {
    expect(familleDuTheme(lisible())).toBe('black-green');
    expect(familleDuTheme(avec('--v2-bg', '#F5F5F5'))).toBe('clear-white');
  });

  it('pose puis retire la feuille et l’attribut', () => {
    const attrs = new Map<string, string>();
    const enfants: any[] = [];
    const doc = {
      getElementById: (id: string) => enfants.find((e) => e.id === id) ?? null,
      createElement: () => ({ id: '', textContent: '', remove() { enfants.splice(enfants.indexOf(this), 1); } }),
      head: { appendChild: (e: any) => enfants.push(e) },
      documentElement: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        removeAttribute: (k: string) => attrs.delete(k),
      },
    } as unknown as Document;
    appliquerMonTheme(lisible(), doc);
    expect(attrs.has(ATTRIBUT_MON_THEME)).toBe(true);
    expect(enfants).toHaveLength(1);
    expect(enfants[0].textContent).toBe(cssDuTheme(lisible()));
    appliquerMonTheme(lisible(), doc);
    expect(enfants).toHaveLength(1);
    appliquerMonTheme(null, doc);
    expect(attrs.has(ATTRIBUT_MON_THEME)).toBe(false);
    expect(enfants).toHaveLength(0);
  });

  it('lit les couleurs calculées du navigateur', () => {
    expect(versHex('rgb(7, 20, 24)')).toBe('#071418');
    expect(versHex(' #0a1a1f ')).toBe('#0A1A1F');
    expect(versHex('#abc')).toBe('#AABBCC');
    expect(versHex('transparent')).toBeNull();
  });
});

describe('#2527 — la découverte par le greffon', () => {
  const fiche = (p: Record<string, unknown>) => ({ name: 'mon-theme', installed: true, enabled: true, ...p });

  it('🔴 lit provides.web_theme d’un greffon ACTIF, quel que soit son nom', () => {
    expect(routeThemeWeb([fiche({ provides: { web_theme: '/api/v1/ext/mon-theme/theme' } })]))
      .toBe('/api/v1/ext/mon-theme/theme');
    expect(routeThemeWeb([{ name: 'autre', enabled: true, provides: { web_theme: '/api/v1/ext/autre/t' } }]))
      .toBe('/api/v1/ext/autre/t');
    expect(routeThemeWeb([fiche({ enabled: false, provides: { web_theme: '/api/v1/ext/mon-theme/theme' } })])).toBeNull();
    expect(routeThemeWeb([fiche({ loaded: false, provides: { web_theme: '/api/v1/ext/mon-theme/theme' } })])).toBeNull();
    expect(routeThemeWeb([fiche({})])).toBeNull();
    expect(routeThemeWeb(null)).toBeNull();
  });

  it.each(['https://ailleurs.example/t', '//ailleurs/t', '/api/v1/ext/x/../../auth', '/api/v1/system/x', '/api/v1/ext/x'])(
    'ignore une route qui n’est pas celle d’un greffon : %s',
    (r) => { expect(routeThemeWeb([fiche({ provides: { web_theme: r } })])).toBeNull(); },
  );

  it('l’adresse garde la base du client (local ou relais)', () => {
    expect(adresseDuTheme('/api/v1/ext/mon-theme/theme')).toMatch(/\/ext\/mon-theme\/theme$/);
    expect(adresseDuTheme('/api/v1/ext/mon-theme/theme')).not.toContain('/api/v1/api/v1');
  });

  it('états du greffon : absent, à installer, à redémarrer, actif', () => {
    expect(etatGreffonMonTheme(undefined)).toBe('inconnu');
    expect(etatGreffonMonTheme([])).toBe('absent');
    expect(etatGreffonMonTheme([fiche({ installed: false })])).toBe('a_installer');
    expect(etatGreffonMonTheme([fiche({ enabled: false })])).toBe('a_redemarrer');
    expect(etatGreffonMonTheme([fiche({})])).toBe('actif');
  });

  it('une réponse abîmée vaut « pas de thème », et jamais actif sans thème', () => {
    expect(enregistrementDe({ actif: true, theme: lisible() })).toEqual({ actif: true, theme: lisible() });
    expect(enregistrementDe({ actif: true, theme: { ...lisible(), format: 'x' } })).toEqual({ actif: false, theme: null });
    expect(enregistrementDe({ actif: true, theme: null })).toEqual({ actif: false, theme: null });
    expect(enregistrementDe(null)).toEqual({ actif: false, theme: null });
    // Un thème illisible rangé par un vieux serveur n'est pas peint.
    expect(enregistrementDe({ actif: true, theme: avec('--v2-txt', '#111111') }).theme).toBeNull();
  });
});

describe('#2527 — export / import', () => {
  it('🔴 l’export se relit tel quel', () => {
    const t = lisible();
    const r = lireTheme(texteExport(t));
    expect(r).toEqual({ ok: true, theme: t });
    expect(JSON.parse(texteExport(t))).toEqual({ format: 'tune-theme', version: 1, name: t.name, colors: t.colors });
  });

  it('un fichier qui n’est pas du JSON est refusé (« json »)', () => {
    expect(lireTheme('{pas du json')).toEqual({ ok: false, champ: 'json' });
  });

  it('un import illisible se charge (pour être corrigé) mais ne se juge pas lisible', () => {
    const t = avec('--v2-txt', '#111111');
    expect(lireTheme(JSON.stringify(t)).ok).toBe(true);
    expect(jugerTheme(t).ok).toBe(false);
  });

  it('nom de fichier sans accent ni espace', () => {
    expect(nomDeFichier({ name: 'Été à Paris !' })).toBe('tune-theme-ete-a-paris.json');
    expect(nomDeFichier({ name: '★★★' })).toBe('tune-theme-perso.json');
  });
});
