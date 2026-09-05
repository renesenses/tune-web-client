import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Stop au double-clic (idée de Bertrand, 05/09/2026)', () => {
  const bar = sansCommentaires(lire('src/components/TransportBar.svelte'));

  it('le bouton stop autonome a disparu de la barre', () => {
    expect(bar).not.toContain('control-btn stop-btn');
    expect(bar).not.toContain("$t('common.stop')");
  });

  it("le stop passe par le bouton lecture, sans `ondblclick`", () => {
    // `ondblclick` obligerait à retarder le premier clic de ~300 ms pour
    // distinguer un clic d'un double : sur une barre de transport, une pause
    // qui répond en un tiers de seconde se sent.
    expect(bar).toContain('onclick={clicLecture}');
    expect(bar).not.toContain('ondblclick');
  });

  it('le PREMIER clic agit tout de suite, il n’est pas retardé', () => {
    const i = bar.indexOf('async function clicLecture()');
    expect(i).toBeGreaterThan(-1);
    const corps = bar.slice(i, i + 700);
    expect(corps).not.toContain('setTimeout');
    // Le chemin normal reste la bascule immédiate.
    expect(corps).toContain('await togglePlayPause()');
  });

  it('le SECOND clic arrête au lieu de rebasculer en lecture', () => {
    // Sans ce garde, `onclick` se déclencherait deux fois et la musique
    // repartirait entre les deux — un sursaut audible.
    const i = bar.indexOf('async function clicLecture()');
    const corps = bar.slice(i, i + 700);
    expect(corps).toContain('maintenant - dernierClicLecture < FENETRE_DOUBLE_CLIC');
    expect(corps).toContain('await stopAndSync(zone.id)');
    expect(corps).toContain('return;');
  });

  it("la fenêtre est remise à zéro après un stop", () => {
    // Sinon un troisième clic rapide serait pris pour un second et renverrait
    // un stop au lieu de relancer la lecture.
    const i = bar.indexOf('async function clicLecture()');
    const corps = bar.slice(i, i + 700);
    expect(corps).toContain('dernierClicLecture = 0;');
  });

  it('le double-clic arrête depuis PAUSE comme depuis PLAY', () => {
    // Bertrand, 05/09/2026 : « Stop sur pause : double click. Stop sur Play :
    // double click. » La condition d'arrêt ne regarde donc PAS l'état de
    // lecture — seulement la zone et la source. Depuis Play, le premier clic
    // lance et le second arrête : le résultat net est l'arrêt.
    const i = bar.indexOf('async function clicLecture()');
    const corps = bar.slice(i, i + 700);
    expect(corps).toContain('if (second && stopPossible && zone?.id)');
    expect(corps, "l'arrêt ne doit pas dépendre de l'état de lecture").not.toContain('isPlaying');
  });

  it("l'arrêt REPORTE l'état de la zone", () => {
    // Bertrand, 05/09/2026 : « Play - Pause - Stop me semble mal géré ». Après
    // un `api.stop` nu, la zone restait « playing » dans le magasin : le bouton
    // gardait l'icône pause, et le clic suivant envoyait une pause à une zone
    // déjà arrêtée — le bouton paraissait mort.
    const zones = lire('src/lib/stores/zones.ts');
    expect(zones).toContain('export async function stopAndSync(zoneId: number)');
    expect(zones.slice(zones.indexOf('export async function stopAndSync'), zones.indexOf('export async function stopAndSync') + 300))
      .toContain('syncZone(zone)');
    // Plus personne n'appelle `api.stop` sans reporter l'état.
    for (const f of ['src/components/TransportBar.svelte', 'src/lib/keyboard.ts']) {
      expect(sansCommentaires(lire(f)), f).not.toContain('api.stop(');
    }
  });

  it('la fenêtre du double-clic ne mange pas un re-clic délibéré', () => {
    // Mettre en pause puis relancer aussitôt est courant : à 350 ms ce second
    // clic passait pour un double et arrêtait la lecture.
    expect(bar).toContain('const FENETRE_DOUBLE_CLIC = 250;');
  });

  it("la RADIO n'a pas de stop", () => {
    // Un flux en direct ne se met pas en pause pour reprendre où l'on était.
    // Le bouton autonome l'excluait déjà.
    expect(bar).toContain("const stopPossible = $derived(!!zone?.id && displayTrack?.source !== 'radio')");
  });

  it("l'infobulle ANNONCE le geste, sinon personne ne le devine", () => {
    expect(bar).toContain('transport.dblClickStop');
    const fr = lire('src/lib/locales/fr.ts');
    expect(fr).toContain('"transport.dblClickStop"');
  });
});
