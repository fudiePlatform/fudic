/**
 * What each workspace folder declares about itself — SDD-41 criteria 13, 14 and 15.
 *
 * The editor does exactly one thing with a project's prefix: it PROPOSES it. Nothing is
 * checked against it, and the last describe here is the test that keeps it that way.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../src/document-cache.js';
import { DEFAULT_COMPONENT_TAG, ProjectConfigs } from '../src/project-config.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { component, memoryFs } from './_support.js';

const ROOT = '/p';

function configs(files: Readonly<Record<string, string>>, root = ROOT): ProjectConfigs {
  const instance = new ProjectConfigs(memoryFs(files));
  instance.scan(root);
  return instance;
}

describe('ProjectConfigs', () => {
  it('reads the fudic.json of the folder it was opened on', () => {
    const project = configs({ '/p/fudic.json': '{"id":"shop","prefix":"shop"}' });

    expect(project.configFor('/p/src/card.fud')?.prefix).toBe('shop');
  });

  it('a folder with no fudic.json declares nothing', () => {
    expect(configs({})?.configFor('/p/src/card.fud')).toBeNull();
  });

  it('a fudic.json that does not read declares nothing either', () => {
    expect(configs({ '/p/fudic.json': '{' }).configFor('/p/card.fud')).toBeNull();
  });

  it('a file outside every known folder is governed by nothing', () => {
    expect(configs({ '/p/fudic.json': '{"id":"shop"}' }).configFor('/otro/card.fud')).toBeNull();
  });

  it('the innermost folder wins when two are open', () => {
    const project = new ProjectConfigs(
      memoryFs({
        '/p/fudic.json': '{"prefix":"raiz"}',
        '/p/apps/tienda/fudic.json': '{"prefix":"tienda"}',
      }),
    );
    project.scan('/p');
    project.scan('/p/apps/tienda/');

    expect(project.configFor('/p/apps/tienda/src/card.fud')?.prefix).toBe('tienda');
    expect(project.configFor('/p/src/card.fud')?.prefix).toBe('raiz');
  });

  describe('the tag the component skeleton proposes (criterion 14)', () => {
    it('comes from the project when it declares a prefix', () => {
      expect(configs({ '/p/fudic.json': '{"prefix":"shop"}' }).componentTagFor('/p/x.fud')).toBe(
        'shop-button',
      );
    });

    it('is the literal of before this SDD when it declares none', () => {
      expect(configs({ '/p/fudic.json': '{"id":"shop"}' }).componentTagFor('/p/x.fud')).toBe(
        DEFAULT_COMPONENT_TAG,
      );
    });

    it('is that same literal with no fudic.json at all', () => {
      expect(configs({}).componentTagFor('/p/x.fud')).toBe(DEFAULT_COMPONENT_TAG);
    });
  });

  describe('editing the file revalidates without a restart (criterion 15)', () => {
    it('a changed prefix changes what the next file is offered', () => {
      const files: Record<string, string> = { '/p/fudic.json': '{"prefix":"app"}' };
      const project = new ProjectConfigs(memoryFs(files));
      project.scan(ROOT);
      expect(project.componentTagFor('/p/x.fud')).toBe('app-button');

      files['/p/fudic.json'] = '{"prefix":"shop"}';
      project.invalidate('/p/fudic.json');

      expect(project.componentTagFor('/p/x.fud')).toBe('shop-button');
    });

    it('a fudic.json of a folder this server was not opened on is ignored', () => {
      const project = configs({ '/p/fudic.json': '{"prefix":"app"}' });

      project.invalidate('/otro/sitio/fudic.json');

      expect(project.componentTagFor('/p/x.fud')).toBe('app-button');
    });
  });
});

/**
 * Criterion 13, and the reason `FUD0722` stays reserved: a component whose tag departs from
 * the project's prefix publishes NOTHING. Not an error, not a warning.
 *
 * The prefix is a guide, and the naming convention of a project belongs to whoever writes
 * it. This is the test that fails the day somebody wires the prefix into diagnostics.
 */
describe('no .fud gains a diagnostic from the project config', () => {
  it('signal-counter under prefix "app" is silent', () => {
    const files = {
      '/p/fudic.json': '{"id":"basic","prefix":"app"}',
      '/p/components/signal-counter.fud': component('signal-counter'),
    };
    const index = new WorkspaceIndex(memoryFs(files));
    index.scan(ROOT);
    const cache = new DocumentCache(index);

    const document = cache.get(
      '/p/components/signal-counter.fud',
      1,
      files['/p/components/signal-counter.fud'],
    );

    expect(document.diagnostics).toEqual([]);
    // And the project does declare the prefix it departs from — otherwise this proves nothing.
    expect(configs(files).configFor('/p/components/signal-counter.fud')?.prefix).toBe('app');
  });
});
