// Forum (rapport anonyme rc8.1), tune-server-rust#7388 : sur la page Streaming
// sans service connecté, le bouton d'accès aux réglages ouvrait Général au
// lieu de « Accès et jetons ». Il doit poser la cible (onglet `access`,
// section `streaming`) avant d'ouvrir les Réglages.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../components/v2/StreamingV2.svelte'), 'utf8');

describe('#7388 — Streaming sans service : bouton vers les jetons', () => {
  it("le bouton de l'avis passe par ouvrirReglagesJetons, pas par activeView seul", () => {
    const avis = src.slice(src.indexOf('v2.stream.noServiceB'), src.indexOf('v2.stream.noServiceB') + 400);
    expect(avis).toContain('onclick={ouvrirReglagesJetons}');
    expect(avis).not.toContain("activeView.set('settings')");
  });
  it("ouvrirReglagesJetons pose la cible access/streaming puis ouvre les Réglages", () => {
    const m = src.match(/function ouvrirReglagesJetons\(\) \{([\s\S]*?)\n  \}/);
    expect(m).not.toBeNull();
    const corps = m![1];
    expect(corps).toContain("v2SettingsTarget.set({ tab: 'access', section: 'streaming' })");
    expect(corps.indexOf('v2SettingsTarget.set')).toBeLessThan(corps.indexOf("activeView.set('settings')"));
  });
});
