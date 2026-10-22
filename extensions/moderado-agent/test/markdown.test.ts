import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/markdown.js';

describe('markdown renderer', () => {
  it('renders headings and paragraphs', () => {
    expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>');
    expect(renderMarkdown('### Third')).toBe('<h3>Third</h3>');
    expect(renderMarkdown('One\n\nTwo')).toBe('<p>One</p><p>Two</p>');
    // A single newline inside a paragraph is a line break, as in a chat reply.
    expect(renderMarkdown('One\nTwo')).toBe('<p>One<br />Two</p>');
  });

  it('renders inline emphasis, code, and links', () => {
    expect(renderMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>');
    expect(renderMarkdown('_italic_')).toBe('<p><em>italic</em></p>');
    expect(renderMarkdown('~~gone~~')).toBe('<p><del>gone</del></p>');
    expect(renderMarkdown('`code`')).toBe('<p><code>code</code></p>');
    expect(renderMarkdown('[docs](https://example.com)')).toBe('<p><a href="https://example.com">docs</a></p>');
    expect(renderMarkdown('<https://example.com>')).toBe('<p><a href="https://example.com">https://example.com</a></p>');
    expect(renderMarkdown('see https://example.com now')).toBe('<p>see <a href="https://example.com">https://example.com</a> now</p>');
  });

  it('renders a fenced code block without interpreting its content', () => {
    const html = renderMarkdown('```ts\nconst a = **b**;\n```');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('const a = **b**;');
    expect(html).not.toContain('<strong>');
  });

  it('renders an unterminated fence as a code block while the reply streams', () => {
    // The closing fence has not arrived yet; the block must not change shape
    // when it does.
    const html = renderMarkdown('```ts\nconst a = 1;');
    expect(html).toBe('<pre><code class="language-ts">const a = 1;\n</code></pre>');
  });

  it('renders flat and nested lists', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li><p>one</p></li><li><p>two</p></li></ol>');
    const nested = renderMarkdown('- one\n  - inner\n- two');
    expect(nested).toContain('<ul><li><p>one</p><ul><li><p>inner</p></li></ul></li><li><p>two</p></li></ul>');
  });

  it('renders block quotes and rules', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote><p>quoted</p></blockquote>');
    expect(renderMarkdown('---')).toBe('<hr />');
  });

  it('escapes raw HTML in a reply', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror=bad>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=bad&gt;');
  });

  it('does not link an unsafe scheme', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>bad</script>', 'vbscript:bad', 'file:///etc/passwd']) {
      const html = renderMarkdown(`[click](${url})`);
      expect(html).not.toContain('<a ');
      expect(html).toContain('click');
    }
  });

  it('does not link an image with an unsafe scheme', () => {
    const html = renderMarkdown('![alt](javascript:alert(1))');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('javascript:');
  });

  it('shows an image as a link to it, because the chat loads no remote resource', () => {
    const html = renderMarkdown('![a diagram](https://example.com/a.png)');
    expect(html).toContain('<a class="md-image" href="https://example.com/a.png">a diagram</a>');
  });

  it('keeps an underscore inside a word literal', () => {
    expect(renderMarkdown('some_variable_name')).toBe('<p>some_variable_name</p>');
    expect(renderMarkdown('a _word_ here')).toBe('<p>a <em>word</em> here</p>');
  });

  it('does not let a link label break out of the anchor', () => {
    const html = renderMarkdown('[" onclick="bad](https://example.com)');
    expect(html).not.toContain('onclick="bad"');
    expect(html).toContain('&quot;');
  });

  it('bounds nested inline constructs', () => {
    const html = renderMarkdown(`${'['.repeat(200)}x${']'.repeat(200)}`);
    expect(html.length).toBeLessThan(4000);
  });

  it('renders an empty reply as nothing', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('\n\n')).toBe('');
  });
});
