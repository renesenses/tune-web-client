import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');
const streaming = read('../../components/StreamingView.svelte');
const sidebar = read('../../components/Sidebar.svelte');

describe('sélecteur de services sur écran étroit (#2173)', () => {
  it('reste utilisable dans la largeur où la barre latérale disparaît', () => {
    expect(sidebar).toMatch(
      /@media \(max-width: 768px\)[\s\S]{0,120}\.sidebar \{ display: none; \}/,
    );
    expect(streaming).toContain('{#each selectableServices as availableService}');
    expect(streaming).toContain('onclick={() => selectService(availableService)}');
    expect(streaming).toContain('activeStreamingService.set(s)');
  });

  it('ne propose que les services actifs et mène aux réglages si la liste est vide', () => {
    const start = streaming.indexOf('let selectableServices = $derived(');
    const end = streaming.indexOf('let zone = $derived', start);
    const selector = streaming.slice(start, end);

    expect(selector).toContain('status.enabled && status.authenticated');
    expect(streaming).toContain("onclick={goToSettings}>{$tr('streaming.goToSettings')}");
  });

  it('ne renvoie plus vers une barre latérale absente dans aucune langue', () => {
    const forbidden = /sidebar|barre latérale|Seitenleiste|barra lateral|oldalsáv|サイドバー|사이드바|bara laterală|sidofält|侧边栏/i;
    for (const locale of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const source = read(`../locales/${locale}.ts`);
      const line = source.split('\n').find((candidate) =>
        candidate.includes('streaming.selectService'),
      );
      expect(line, `${locale}: clé absente`).toBeDefined();
      expect(line, `${locale}: renvoi vers la sidebar`).not.toMatch(forbidden);
    }
  });
});
