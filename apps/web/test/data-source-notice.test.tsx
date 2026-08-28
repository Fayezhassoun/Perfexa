import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DataSourceNotice } from '@/components/data-source-notice';

describe('DataSourceNotice', () => {
  it('makes each source state visible and honest', () => {
    const sources = ['none', 'live', 'sandbox', 'mixed'] as const;
    const markup = sources.map((source) => renderToStaticMarkup(createElement(DataSourceNotice, { source }))).join('\n');

    expect(markup).toContain('Setup needed');
    expect(markup).toContain('Live account data');
    expect(markup).toContain('Sandbox data');
    expect(markup).toContain('Mixed data sources');
    expect(markup).toContain('not customer evidence');
  });
});
