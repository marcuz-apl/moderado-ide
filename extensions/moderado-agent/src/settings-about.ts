/** Static Settings fragment; versions are text, never executable markup. */
export function settingsAboutHtml(version: string, editorVersion?: string): string {
  return `<section class="about-card" aria-labelledby="about-title">
  <h1 id="about-title">Moderado IDE</h1>
  <p class="about-intro">A coding environment with an AI assistant to help you understand and work with your code.</p>
  <dl class="about-details">
    <div><dt>IDE version</dt><dd>${escapeHtml(version)}</dd></div>
    ${editorVersion === undefined ? '' : `<div><dt>Editor version</dt><dd>${escapeHtml(editorVersion)}</dd></div>`}
    <div><dt>License</dt><dd>MIT</dd></div>
  </dl>
  <p class="about-link"><a href="https://github.com/marcuz-apl/moderado-ide">Project on GitHub</a></p>
  <p class="about-copyright">© 2026 Moderado IDE, Alfazen Inc. All rights reserved.</p>
</section>`;
}

import { escapeHtml } from './html.js';
