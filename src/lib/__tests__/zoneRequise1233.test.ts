/**
 * #1233 — « fiche Titres phares non clickables ! » (Bertrand, présentation du
 * 18/09/2026).
 *
 * Les lignes étaient branchées : `BioEtTitresPhares` monte `ListePistesV2`
 * avec `onLire={(_p, i) => lireDepuis(i)}`, et `lireDepuis` enchaîne bien la
 * liste. Ce qu'elle faisait aussi, c'est sortir EN SILENCE quand aucune zone
 * n'est active — le clic ne fait rien, l'écran se tait, et de l'extérieur la
 * ligne est « non cliquable ».
 *
 * 🔴 Ce n'était pas le défaut d'un écran mais de VINGT-HUIT gestes. Relevé sur
 * `main` le 19/09/2026 :
 *
 *     git grep -A1 "const zid = $currentZoneId;" -- src/components/v2 \
 *       | grep -c "zid == null) return;"      → 28
 *
 * sur quatorze fichiers : lecture, mise en file, égaliseur, crossfeed,
 * profileur. Tous muets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { get } from 'svelte/store';
import { currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { zoneRequise } from '../zoneRequise';

const V2 = 'src/components/v2';
const fichiersV2 = readdirSync(V2).filter((f) => f.endsWith('.svelte'));
const lire = (f: string) => readFileSync(`${V2}/${f}`, 'utf8');

beforeEach(() => currentZoneId.set(null));

describe('#1233 — le geste rend la zone, ou la réclame', () => {
  it('une zone active est rendue telle quelle, sans un mot', async () => {
    currentZoneId.set(7);
    const espion = vi.spyOn(notifications, 'error');
    expect(zoneRequise()).toBe(7);
    expect(espion).not.toHaveBeenCalled();
    espion.mockRestore();
  });

  it('🔴 sans zone, il rend `null` — ET il le DIT', async () => {
    const espion = vi.spyOn(notifications, 'error');
    expect(zoneRequise()).toBeNull();
    // Le message part par un import dynamique de l'i18n : on laisse la
    // micro-tâche se résoudre avant de juger.
    await new Promise((r) => setTimeout(r, 0));
    expect(espion).toHaveBeenCalled();
    espion.mockRestore();
  });

  it('il ne touche pas au magasin', () => {
    zoneRequise();
    expect(get(currentZoneId)).toBeNull();
  });
});

describe('#1233 — plus un seul geste muet dans v2', () => {
  it('🔴 le motif silencieux a disparu des quatorze fichiers', () => {
    const coupables: string[] = [];
    for (const f of fichiersV2) {
      const lignes = lire(f).split('\n');
      for (let i = 0; i < lignes.length - 1; i++) {
        if (/const zid = \$currentZoneId;/.test(lignes[i])
            && /zid == null\) return;/.test(lignes[i + 1])) {
          coupables.push(`${f}:${i + 1}`);
        }
      }
    }
    expect(coupables, `gestes encore muets : ${coupables.join(', ')}`).toEqual([]);
  });

  it('et les seize écrans passent par le helper', () => {
    const avec = fichiersV2.filter((f) => lire(f).includes("from '../../lib/zoneRequise'"));
    // Quinze depuis la phase 5, lot 4 : `YouTubeDecouverteV2` (tendances et
    // ambiances YouTube Music) lance la lecture, donc passe par le helper.
    // Seize depuis le 20/09/2026 : `ListePistesV2` lance elle-même « Lire à
    // partir d'ici » quand l'écran ne le fournit pas, et ce geste-là doit
    // réclamer la zone comme les autres.
    expect(avec.length).toBe(16);
    expect(avec).toContain('ListePistesV2.svelte');
    expect(avec).toContain('YouTubeDecouverteV2.svelte');
    // L'écran que Bertrand nomme en fait partie.
    expect(avec).toContain('BioEtTitresPhares.svelte');
  });

  it('🔴 la garde COMPOSÉE de RadiosV2 a été séparée, pas contournée', () => {
    // Une radio sans identifiant est un défaut de donnée dont l'utilisateur
    // n'a rien à faire ; une zone absente est une chose qu'il peut corriger.
    const src = lire('RadiosV2.svelte');
    expect(src).not.toContain('if (r.id == null || zid == null) return;');
    expect(src).toContain('if (r.id == null) return;');
    expect(src).toContain('const zid = zoneRequise();');
  });
});

describe('#1233 — aucune HUITIÈME clé pour le même message', () => {
  it('on réutilise celle qui existe et qui est la plus explicite', () => {
    const src = readFileSync('src/lib/zoneRequise.ts', 'utf8');
    expect(src).toContain('library.noZoneSelectedSelectZone');
    // Contre-épreuve : le message existait déjà SEPT fois. On n'en crée pas
    // une de plus.
    const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');
    for (const k of ['queue.noZoneSelected', 'nowplaying.noZoneSelected',
                     'library.noZoneSelected', 'library.noZoneSelectedShort',
                     'library.noZoneSelectedSelectZone', 'v2.art.noZone', 'v2.col.noZone']) {
      expect(fr, k).toContain(k);
    }
  });

  it('elle est traduite dans les ONZE langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
      expect(readFileSync(`src/lib/locales/${l}.ts`, 'utf8'), l)
        .toContain('library.noZoneSelectedSelectZone');
    }
  });

  it('⚠️ l\'i18n est tirée par import DYNAMIQUE', () => {
    // `lib/i18n` lit `localStorage` à l'évaluation du module : un import en
    // tête ferait tomber les bancs qui tournent en `node`. Même motif que
    // `loadingInstead()` dans `stores/zones.ts`.
    const src = readFileSync('src/lib/zoneRequise.ts', 'utf8');
    expect(src).toContain("await import('./i18n')");
    expect(src).not.toMatch(/^import .*from '\.\/i18n'/m);
  });
});
