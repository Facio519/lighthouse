/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

import path from 'path';

import {jest} from '@jest/globals';

import {
  deepClone,
  deepCloneConfigJson,
  resolveSettings,
  resolveGathererToDefn,
  resolveAuditsToDefns,
  resolveModulePath,
  mergePlugins,
  mergeConfigFragment,
  mergeConfigFragmentArrayByKey,
} from '../../config/config-helpers.js';
import Runner from '../../runner.js';
import Gatherer from '../../gather/gatherers/gatherer.js';
import ImageElementsGatherer from '../../gather/gatherers/image-elements.js';
import UserTimingsAudit from '../../audits/user-timings.js';
import {LH_ROOT} from '../../../root.js';
import {createCommonjsRefs} from '../../scripts/esm-utils.js';

const {require, __dirname} = createCommonjsRefs(import.meta);

const originalCwd = process.cwd;
afterAll(() => {
  process.cwd = originalCwd;
});

describe('.mergeConfigFragment', () => {
  it('should merge properties in like Object.assign', () => {
    const base = {a: 1, b: 'yes', c: true};
    const extension = {a: 2, c: false, d: 123};
    const merged = mergeConfigFragment(base, extension);
    expect(merged).toBe(base);
    expect(merged).toEqual({a: 2, b: 'yes', c: false, d: 123});
  });

  it('should merge recursively', () => {
    const base = {foo: {bar: 1}};
    const extension = {foo: {baz: 2, bam: 3}};
    const merged = mergeConfigFragment(base, extension);
    expect(merged).toEqual({foo: {bar: 1, baz: 2, bam: 3}});
  });

  it('should not preserve null', () => {
    // It is unclear how important this behavior is, but the `null` issue has had subtle
    // importance in the config for many years at this point.
    const base = {foo: null};
    const extension = {foo: undefined};
    const merged = mergeConfigFragment(base, extension);
    expect(merged).toEqual({foo: undefined});
  });

  it('should concat arrays with deduplication', () => {
    const base = {arr: [{x: 1}, {y: 2}]};
    const extension = {arr: [{z: 3}, {x: 1}]};
    const merged = mergeConfigFragment(base, extension);
    expect(merged).toEqual({arr: [{x: 1}, {y: 2}, {z: 3}]});
  });

  it('should overwrite arrays when `overwriteArrays=true`', () => {
    const base = {arr: [{x: 1}, {y: 2}]};
    const extension = {arr: [{z: 3}, {x: 1}]};
    const merged = mergeConfigFragment(base, extension, true);
    expect(merged).toEqual({arr: [{z: 3}, {x: 1}]});
  });

  it('should special-case the `settings` key to enable `overwriteArrays`', () => {
    const base = {settings: {onlyAudits: ['none']}};
    const extension = {settings: {onlyAudits: ['user-timings']}};
    const merged = mergeConfigFragment(base, extension);
    expect(merged).toEqual({settings: {onlyAudits: ['user-timings']}});
  });

  it('should throw when merging incompatible types', () => {
    expect(() => mergeConfigFragment(123, {})).toThrow();
    expect(() => mergeConfigFragment('foo', {})).toThrow();
    expect(() => mergeConfigFragment(123, [])).toThrow();
    expect(() => mergeConfigFragment('foo', [])).toThrow();
    expect(() => mergeConfigFragment({}, [])).toThrow();
    expect(() => mergeConfigFragment([], {})).toThrow();
  });
});

describe('.mergeConfigFragmentArrayByKey', () => {
  it('should use mergeConfigFragment to merge items', () => {
    const base = [{a: 1, b: 'yes', c: true}];
    const extension = [{a: 2, c: false, d: 123}];
    const merged = mergeConfigFragmentArrayByKey(base, extension, () => 'key');
    expect(merged).toBe(base);
    expect(merged).toEqual([{a: 2, b: 'yes', c: false, d: 123}]);
  });

  it('should merge by the keyFn', () => {
    const base = [{id: 'a', value: 1}, {id: 'b', value: 2}];
    const extension = [{id: 'b', value: 1}, {id: 'a', value: 2}, {id: 'c'}];
    const merged = mergeConfigFragmentArrayByKey(base, extension, item => item.id);
    expect(merged).toEqual([{id: 'a', value: 2}, {id: 'b', value: 1}, {id: 'c'}]);
  });

  it('should merge recursively', () => {
    const base = [{foo: {bar: 1}}];
    const extension = [{foo: {baz: 2, bam: 3}}];
    const merged = mergeConfigFragmentArrayByKey(base, extension, () => 'key');
    expect(merged).toEqual([{foo: {bar: 1, baz: 2, bam: 3}}]);
  });

  it('should handle null items in base', () => {
    const base = [null];
    const extension = [{x: 1}];
    const merged = mergeConfigFragmentArrayByKey(base, extension, () => '');
    expect(merged).toEqual([{x: 1}]);
  });

  it('should handle undefined items in extension', () => {
    const base = [{x: 1}];
    const extension = [undefined];
    const merged = mergeConfigFragmentArrayByKey(base, extension, () => '');
    expect(merged).toEqual([undefined]);
  });
});

describe('.deepClone', () => {
  it('should clone things deeply', () => {
    const input = {a: {b: {c: 1}}};
    const output = deepClone(input);
    expect(output).not.toBe(input);
    expect(output).toEqual(input);
    output.a.b.c = 2;
    expect(input.a.b.c).toEqual(1);
  });
});

describe('.deepCloneConfigJson', () => {
  it('should clone a config deeply', () => {
    const TimingGatherer = new Gatherer();
    const input = {
      artifacts: [{id: 'Timing', gatherer: TimingGatherer}],
      passes: [{passName: 'defaultPass', gatherers: []}],
      audits: [{path: 'user-timings'}],
      categories: {random: {auditRefs: [{id: 'user-timings'}]}},
    };

    const output = deepCloneConfigJson(input);
    expect(output).not.toBe(input);
    expect(output).toEqual(input);
    output.artifacts[0].id = 'NewName';
    output.passes[0].passName = 'newName';
    output.audits[0].path = 'new-audit';
    output.categories.random.auditRefs[0].id = 'new-audit';
    expect(input.artifacts[0].id).toEqual('Timing');
    expect(input.passes[0].passName).toEqual('defaultPass');
    expect(input.audits[0].path).toEqual('user-timings');
    expect(input.categories.random.auditRefs[0].id).toEqual('user-timings');
  });

  it('should preserve gatherer implementations in passes', () => {
    const TimingGatherer = new Gatherer();
    const input = {
      passes: [{passName: 'defaultPass', gatherers: [TimingGatherer]}],
    };

    const output = deepCloneConfigJson(input);
    expect(output.passes[0].gatherers[0]).toEqual(TimingGatherer);
  });

  it('should preserve gatherer implementations in artifacts', () => {
    const TimingGatherer = new Gatherer();
    const input = {
      artifacts: [{id: 'Timing', gatherer: TimingGatherer}],
    };

    const output = deepCloneConfigJson(input);
    expect(output.artifacts[0].gatherer).toEqual(TimingGatherer);
  });

  it('should preserve audit implementations', () => {
    const input = {
      audits: [{implementation: UserTimingsAudit}],
    };

    const output = deepCloneConfigJson(input);
    expect(output.audits[0].implementation).toEqual(UserTimingsAudit);
  });
});

describe('.mergePlugins', () => {
  // Include a configPath flag so that config.js looks for the plugins in the fixtures dir.
  const configDir = `${LH_ROOT}/lighthouse-core/test/fixtures/config-plugins/`;

  it('merge plugins from the config', () => {
    const configJson = {
      audits: ['installable-manifest', 'metrics'],
      plugins: ['lighthouse-plugin-simple'],
    };

    const config = mergePlugins(configJson, configDir, {});
    expect(config).toMatchObject({
      audits: [
        'installable-manifest',
        'metrics',
        {path: 'redirects'},
        {path: 'user-timings'},
      ],
      categories: {
        'lighthouse-plugin-simple': {title: 'Simple'},
      },
      groups: {
        'lighthouse-plugin-simple-new-group': {title: 'New Group'},
      },
    });
  });

  it('merge plugins from flags', () => {
    const configJson = {
      audits: ['installable-manifest', 'metrics'],
      plugins: ['lighthouse-plugin-simple'],
    };
    const flags = {plugins: ['lighthouse-plugin-no-groups']};
    const config = mergePlugins(configJson, configDir, flags);

    expect(config.categories).toHaveProperty('lighthouse-plugin-simple');
    expect(config.categories).toHaveProperty('lighthouse-plugin-no-groups');
  });

  it('validate plugin name', () => {
    const configJson = {audits: ['installable-manifest', 'metrics']};
    const flags = {plugins: ['not-a-plugin']};
    expect(() => mergePlugins(configJson, configDir, flags)).toThrow(/does not start/);
  });

  it('validate plugin existence', () => {
    const configJson = {audits: ['installable-manifest', 'metrics']};
    const flags = {plugins: ['lighthouse-plugin-missing']};
    expect(() => mergePlugins(configJson, configDir, flags)).toThrow(/Unable to locate plugin/);
  });

  it('validate plugin structure', () => {
    const configJson = {audits: ['installable-manifest', 'metrics']};
    const flags = {plugins: ['lighthouse-plugin-no-category']};
    expect(() => mergePlugins(configJson, configDir, flags)).toThrow(/no valid category/);
  });
});

describe('.resolveSettings', () => {
  it('resolves the locale', () => {
    const settings = resolveSettings({locale: 'zh-CN'});
    expect(settings.locale).toEqual('zh');
  });

  it('fills with defaults', () => {
    const settings = resolveSettings({});
    expect(settings.formFactor).toEqual('mobile');
  });

  it('preserves array settings when merging', () => {
    const settings = resolveSettings({output: ['html']});
    expect(settings.output).toEqual(['html']);
  });

  it('cleans unrecognized properties from overrides', () => {
    const settings = resolveSettings({}, {nonsense: 1, output: 'html'});
    expect(settings.output).toEqual('html');
    expect(settings).not.toHaveProperty('nonsense');
  });

  describe('budgets', () => {
    it('initializes budgets', () => {
      const settings = resolveSettings({
        budgets: [
          {
            path: '/',
            resourceCounts: [{resourceType: 'image', budget: 500}],
          },
        ],
      });

      expect(settings).toMatchObject({
        budgets: [
          {
            path: '/',
            resourceCounts: [{resourceType: 'image', budget: 500}],
          },
        ],
      });
    });

    it('validates budgets', () => {
      expect(() => resolveSettings({budgets: ['invalid']})).toThrow(/Budget file is not/);
    });
  });

  describe('validation', () => {
    it('formFactor', () => {
      const desktopSettings = {formFactor: 'desktop', screenEmulation: {mobile: false}};
      expect(() => resolveSettings(desktopSettings)).not.toThrow();
      expect(() => resolveSettings({formFactor: 'mobile'})).not.toThrow();
      expect(() => resolveSettings({formFactor: 'tablet'})).toThrow();
      expect(() => resolveSettings({formFactor: 'thing-a-ma-bob'})).toThrow();
    });

    it('screenEmulation', () => {
      expect(() =>
        resolveSettings({
          formFactor: 'mobile',
          screenEmulation: {mobile: false},
        })
      ).toThrow();
      expect(() =>
        resolveSettings({
          formFactor: 'desktop',
          screenEmulation: {mobile: true},
        })
      ).toThrow();
      expect(() =>
        resolveSettings({
          formFactor: 'mobile',
          screenEmulation: {mobile: false, disabled: true},
        })
      ).not.toThrow();
      expect(() =>
        resolveSettings({
          formFactor: 'desktop',
          screenEmulation: {mobile: true, disabled: true},
        })
      ).not.toThrow();
    });
  });
});

describe('.resolveGathererToDefn', () => {
  const coreList = Runner.getGathererList();

  it('should expand gatherer path short-hand', () => {
    const result = resolveGathererToDefn('image-elements', coreList);
    expect(result).toEqual({
      path: 'image-elements',
      implementation: ImageElementsGatherer,
      instance: expect.any(ImageElementsGatherer),
    });
  });

  it('should find relative to configDir', () => {
    const configDir = path.resolve(__dirname, '../../gather/');
    const result = resolveGathererToDefn('gatherers/image-elements', [], configDir);
    expect(result).toEqual({
      path: 'gatherers/image-elements',
      implementation: ImageElementsGatherer,
      instance: expect.any(ImageElementsGatherer),
    });
  });

  it('should expand gatherer impl short-hand', () => {
    const result = resolveGathererToDefn({implementation: ImageElementsGatherer}, coreList);
    expect(result).toEqual({
      implementation: ImageElementsGatherer,
      instance: expect.any(ImageElementsGatherer),
    });
  });

  it('throws for invalid gathererDefn', () => {
    expect(() => resolveGathererToDefn({})).toThrow(/Invalid Gatherer type/);
  });
});

describe('.resolveAuditsToDefns', () => {
  it('should expand audit short-hand', () => {
    const result = resolveAuditsToDefns(['user-timings']);

    expect(result).toEqual([{path: 'user-timings', options: {}, implementation: UserTimingsAudit}]);
  });

  it('should find relative to configDir', () => {
    const configDir = path.resolve(__dirname, '../../');
    const result = resolveAuditsToDefns(['audits/user-timings'], configDir);

    expect(result).toEqual([
      {path: 'audits/user-timings', options: {}, implementation: UserTimingsAudit},
    ]);
  });

  it('should handle multiple audit definition styles', () => {
    const result = resolveAuditsToDefns(['user-timings', {implementation: UserTimingsAudit}]);

    expect(result).toMatchObject([{path: 'user-timings'}, {implementation: UserTimingsAudit}]);
  });

  it('should merge audit options', () => {
    const audits = [
      'user-timings',
      {path: 'is-on-https', options: {x: 1, y: 1}},
      {path: 'is-on-https', options: {x: 2}},
    ];
    const merged = resolveAuditsToDefns(audits);
    expect(merged).toMatchObject([
      {path: 'user-timings', options: {}},
      {path: 'is-on-https', options: {x: 2, y: 1}},
    ]);
  });

  it('throws for invalid auditDefns', () => {
    expect(() => resolveAuditsToDefns([new Gatherer()])).toThrow(/Invalid Audit type/);
  });
});

describe('.resolveModulePath', () => {
  const configFixturePath = path.resolve(__dirname, '../fixtures/config');

  beforeEach(() => {
    process.cwd = jest.fn(() => configFixturePath);
  });

  it('lighthouse and plugins are installed in the same path', () => {
    const pluginName = 'chrome-launcher';
    const pathToPlugin = resolveModulePath(pluginName, null, 'plugin');
    expect(pathToPlugin).toEqual(require.resolve(pluginName));
  });

  describe('plugin paths to a file', () => {
    it('relative to the current working directory', () => {
      const pluginName = 'lighthouse-plugin-config-helper';
      const pathToPlugin = resolveModulePath(pluginName, null, 'plugin');
      expect(pathToPlugin).toEqual(require.resolve(path.resolve(configFixturePath, pluginName)));
    });

    it('relative to the config path', () => {
      process.cwd = jest.fn(() => path.resolve(configFixturePath, '../'));
      const pluginName = 'lighthouse-plugin-config-helper';
      const pathToPlugin = resolveModulePath(pluginName, configFixturePath, 'plugin');
      expect(pathToPlugin).toEqual(require.resolve(path.resolve(configFixturePath, pluginName)));
    });
  });

  describe('lighthouse and plugins are installed by npm', () => {
    const pluginsDirectory = path.resolve(__dirname, '../fixtures/config/');

    // working directory/
    //   |-- node_modules/
    //   |-- package.json
    it('in current working directory', () => {
      const pluginName = 'plugin-in-working-directory';
      const pluginDir = `${pluginsDirectory}/node_modules/plugin-in-working-directory`;
      process.cwd = jest.fn(() => pluginsDirectory);

      const pathToPlugin = resolveModulePath(pluginName, null, 'plugin');

      expect(pathToPlugin).toEqual(require.resolve(pluginName, {paths: [pluginDir]}));
    });

    // working directory/
    //   |-- config directory/
    //     |-- node_modules/
    //     |-- config.js
    //     |-- package.json
    it('relative to the config path', () => {
      const pluginName = 'plugin-in-config-directory';
      const configDirectory = `${pluginsDirectory}/config`;
      process.cwd = jest.fn(() => '/usr/bin/node');

      const pathToPlugin = resolveModulePath(pluginName, configDirectory, 'plugin');

      expect(pathToPlugin).toEqual(require.resolve(pluginName, {paths: [configDirectory]}));
    });
  });
});
