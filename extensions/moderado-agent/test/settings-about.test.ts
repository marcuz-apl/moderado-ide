import { describe, expect, it } from 'vitest';
import { settingsAboutHtml } from '../src/settings-about.js';

describe('Settings About page', () => {
  it('shows the IDE version, license and project link', () => {
    const html = settingsAboutHtml('v0.1.22+2610084');
    expect(html).toContain('Moderado IDE');
    expect(html).toContain('v0.1.22+2610084');
    expect(html).toContain('MIT');
    expect(html).toContain('https://github.com/marcuz-apl/moderado-ide');
    expect(html).not.toContain('Editor version');
  });

  it('includes an optional editor version and escapes supplied values', () => {
    const html = settingsAboutHtml('<img src=x onerror="bad">&\'', '<script>bad</script>');
    expect(html).toContain('Editor version');
    expect(html).toContain('&lt;img src=x onerror=&quot;bad&quot;&gt;&amp;\'');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
});
