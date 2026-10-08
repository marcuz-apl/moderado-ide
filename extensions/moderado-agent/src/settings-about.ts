/** Static Settings fragment; versions are text, never executable markup. */
export function settingsAboutHtml(version: string, editorVersion?: string): string {
  return `<h1>Moderado IDE</h1>
<dl>
  <dt>IDE version</dt><dd>${escapeHtml(version)}</dd>
  ${editorVersion === undefined ? '' : `<dt>Editor version</dt><dd>${escapeHtml(editorVersion)}</dd>`}
  <dt>License</dt><dd>MIT</dd>
</dl>
<p><a href="https://github.com/marcuz-apl/moderado-ide">Project on GitHub</a></p>`;
}

import { escapeHtml } from './html.js';
