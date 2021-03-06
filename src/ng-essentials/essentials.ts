import { chain, noop, Rule, SchematicsException, Tree } from '@angular-devkit/schematics';

import * as ts from 'typescript';

import { addProviderToModule } from '@schematics/angular/utility/ast-utils';
import { InsertChange } from '@schematics/angular/utility/change';

import { ANGULAR_JSON, NG_ESSENTIALS, TSCONFIG_JSON, TSLINT_JSON } from '../constants';
import {
  addPackageToPackageJson,
  addScriptToPackageJson,
  copyConfigFiles,
  findDefaultProjectNameInAngularJson,
  findElementPrefixInAngularJson,
  removeArchitectNodeFromAngularJson,
  removeAutomaticUpdateSymbols,
  removePackageFromPackageJson,
  removeScriptFromPackageJson,
  updateJson,
} from '../utils';
import { essentials, resolutions } from '../versions';

import { NgEssentialsOptions } from './schema';

export function addEssentials(options: NgEssentialsOptions): Rule {
  if (!options.firstRun) {
    return chain([]);
  }

  return chain([
    (tree: Tree) => {
      const defaultProjectName = findDefaultProjectNameInAngularJson(tree);
      const hasDefaultApplication = defaultProjectName !== '';
      const elementPrefix = hasDefaultApplication ? findElementPrefixInAngularJson(tree, defaultProjectName) : 'app';

      return chain([
        addDefaultSchematicsToAngularJson(),
        addNgEssentialsToAngularJson(options),
        removePackageFromPackageJson('devDependencies', '@types/jasminewd2'),
        removePackageFromPackageJson('devDependencies', 'protractor'),
        removeScriptFromPackageJson('e2e'),
        removeAutomaticUpdateSymbols(),
        removePackageFromPackageJson('dependencies', '@angular/http'),
        addPackageToPackageJson('dependencies', '@angular/animations', essentials.angularVersion),
        addPackageToPackageJson('dependencies', '@angular/common', essentials.angularVersion),
        addPackageToPackageJson('dependencies', '@angular/compiler', essentials.angularVersion),
        addPackageToPackageJson('dependencies', '@angular/core', essentials.angularVersion),
        addPackageToPackageJson('dependencies', '@angular/forms', essentials.angularVersion),
        addPackageToPackageJson('dependencies', '@angular/platform-browser', essentials.angularVersion),
        addPackageToPackageJson('dependencies', '@angular/platform-browser-dynamic', essentials.angularVersion),
        addPackageToPackageJson('dependencies', '@angular/router', essentials.angularVersion),
        addPackageToPackageJson('dependencies', 'rxjs', essentials.rxjsVersion),
        addPackageToPackageJson('dependencies', 'tslib', essentials.tslibVersion),
        addPackageToPackageJson('dependencies', 'zone.js', essentials.zoneVersion),
        addPackageToPackageJson('devDependencies', '@angular-devkit/build-angular', essentials.angularDevKitVersion),
        addPackageToPackageJson('devDependencies', '@angular/cli', essentials.angularVersion),
        addPackageToPackageJson('devDependencies', '@angular/compiler-cli', essentials.angularVersion),
        addPackageToPackageJson('devDependencies', '@angular/language-service', essentials.angularVersion),
        addPackageToPackageJson('devDependencies', '@types/node', essentials.nodeVersion),
        addPackageToPackageJson('devDependencies', 'codelyzer', essentials.codelizerVersion),
        addPackageToPackageJson('devDependencies', 'ts-node', essentials.tsNodeVersion),
        addPackageToPackageJson('devDependencies', 'tslint', essentials.tsLintVersion),
        addPackageToPackageJson('devDependencies', 'typescript', essentials.typescriptVersion),
        addPackageToPackageJson('devDependencies', 'prettier', essentials.prettierVersion),
        addPackageToPackageJson('devDependencies', 'tslint-angular', essentials.tsLintAngularRulesVersion),
        addPackageToPackageJson('devDependencies', 'tslint-config-prettier', essentials.tsLintConfigPrettierVersion),
        addPackageToPackageJson('resolutions', 'acorn', resolutions.acornVersion),
        addPackageToPackageJson('resolutions', 'kind-of', resolutions.kindOfVersion),
        addPackageToPackageJson('resolutions', 'minimist', resolutions.minimistVersion),
        addScriptToPackageJson('preinstall', 'npx npm-force-resolutions'),
        addScriptToPackageJson('format', 'prettier --write "./**/*{.ts,.js,.json,.css,.scss}"'),
        editTsLintConfigJson(elementPrefix),
        editTsConfigJson(),
        createLaunchJson(options),
        copyConfigFiles('./essentials'),
        hasDefaultApplication ? removeEndToEndTsConfigNodeFromAngularJson(defaultProjectName) : noop(),
        hasDefaultApplication ? removeEndToEndTestFiles() : noop(),
        hasDefaultApplication ? removeArchitectNodeFromAngularJson(defaultProjectName, 'e2e') : noop(),
        hasDefaultApplication ? updateDevelopmentEnvironmentFile('src') : noop(),
        hasDefaultApplication ? updateProductionEnvironmentFile('src') : noop(),
        hasDefaultApplication ? addEnvProvidersToAppModule('src') : noop(),
      ]);
    },
  ]);
}

export function updateDevelopmentEnvironmentFile(sourceDirectory: string): Rule {
  return (host: Tree) => {
    host.overwrite(
      `${sourceDirectory}/environments/environment.ts`,
      `const providers: any[] = [
  { provide: 'environment', useValue: 'Development' },
  { provide: 'baseUrl', useValue: 'http://localhost:3000' }
];

export const ENV_PROVIDERS = providers;

export const environment = {
  production: false
};
`
    );

    return host;
  };
}

export function updateProductionEnvironmentFile(sourceDirectory: string): Rule {
  return (host: Tree) => {
    host.overwrite(
      `${sourceDirectory}/environments/environment.prod.ts`,
      `const providers: any[] = [
  { provide: 'environment', useValue: 'Production' },
  { provide: 'baseUrl', useValue: 'http://localhost:3000' }
];

export const ENV_PROVIDERS = providers;

export const environment = {
  production: true
};
`
    );

    return host;
  };
}

export function addEnvProvidersToAppModule(sourceDirectory: string): Rule {
  return (host: Tree) => {
    const modulePath = `${sourceDirectory}/app/app.module.ts`;
    const text = host.read(modulePath);

    if (!text) {
      throw new SchematicsException(`File ${modulePath} does not exist.`);
    }

    const sourceText = text.toString('utf-8');
    const source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);
    const changes = addProviderToModule(source, modulePath, 'ENV_PROVIDERS', '../environments/environment');

    const recorder = host.beginUpdate(modulePath);
    for (const change of changes) {
      if (change instanceof InsertChange) {
        recorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(recorder);

    return host;
  };
}

function removeEndToEndTsConfigNodeFromAngularJson(applicationName: string): Rule {
  return (host: Tree) => {
    if (applicationName) {
      const sourceText = host.read(ANGULAR_JSON).toString('utf-8');
      const angularJson = JSON.parse(sourceText);

      if (angularJson['projects'][applicationName]['architect']['lint']['options']['tsConfig']) {
        angularJson['projects'][applicationName]['architect']['lint']['options']['tsConfig'] = [
          'tsconfig.app.json',
          'tsconfig.spec.json',
        ];
      }

      host.overwrite(ANGULAR_JSON, JSON.stringify(angularJson, null, 2));
    }

    return host;
  };
}

function removeEndToEndTestFiles(): Rule {
  return (host: Tree) => {
    host.delete('e2e/src/app.e2e-spec.ts');
    host.delete('e2e/src/app.po.ts');
    host.delete('e2e/protractor.conf.js');
    host.delete('e2e/tsconfig.json');
  };
}

function addDefaultSchematicsToAngularJson(): Rule {
  return (host: Tree) => {
    const sourceText = host.read(ANGULAR_JSON).toString('utf-8');
    const angularJson = JSON.parse(sourceText);

    if (!angularJson['cli']) {
      angularJson['cli'] = {};
    }

    if (!angularJson['cli']['defaultCollection']) {
      angularJson['cli']['defaultCollection'] = NG_ESSENTIALS;
    }

    host.overwrite(ANGULAR_JSON, JSON.stringify(angularJson, null, 2));

    return host;
  };
}

function addNgEssentialsToAngularJson(options: NgEssentialsOptions): Rule {
  return (host: Tree) => {
    const sourceText = host.read(ANGULAR_JSON).toString('utf-8');
    const angularJson = JSON.parse(sourceText);

    if (!angularJson['schematics']) {
      angularJson['schematics'] = {};
    }

    if (angularJson['schematics'][NG_ESSENTIALS]) {
      return host;
    }

    angularJson['schematics'][NG_ESSENTIALS] = {
      jest: options.jest ? options.jest.valueOf() : false,
      cypress: options.cypress ? options.cypress.valueOf() : false,
    };

    host.overwrite(ANGULAR_JSON, JSON.stringify(angularJson, null, 2));

    return host;
  };
}

function editTsLintConfigJson(elementPrefix: string): Rule {
  return (host: Tree) => {
    const sourceText = host.read(TSLINT_JSON).toString('utf-8');
    const tslintJson = JSON.parse(sourceText);

    tslintJson['extends'] = ['tslint:recommended', 'tslint-angular', 'tslint-config-prettier'];
    tslintJson['rulesDirectory'] = ['codelyzer'];
    tslintJson['rules'] = {
      'directive-selector': [true, 'attribute', elementPrefix, 'camelCase'],
      'component-selector': [true, 'element', elementPrefix, 'kebab-case'],
      'no-console': [true, 'debug', 'info', 'time', 'timeEnd', 'trace'],
      'interface-name': false,
      'max-classes-per-file': false,
      'ordered-imports': [
        true,
        {
          'grouped-imports': true,
          groups: [
            {
              name: 'angular',
              match: '^@angular',
              order: 1,
            },

            {
              name: 'scoped_paths',
              match: '^@',
              order: 3,
            },
            {
              name: 'node_modules',
              match: '^[a-zA-Z]',
              order: 2,
            },
            {
              name: 'parent',
              match: '^../',
              order: 4,
            },
            {
              name: 'silbing',
              match: '^./',
              order: 5,
            },
            {
              match: null,
              order: 5,
            },
          ],
        },
      ],
    };

    host.overwrite(TSLINT_JSON, JSON.stringify(tslintJson, null, 2));

    return host;
  };
}

function editTsConfigJson(): Rule {
  return updateJson(TSCONFIG_JSON, (json) => {
    const compilerOptions = json['compilerOptions'];

    return {
      ...json,
      compilerOptions: {
        ...compilerOptions,
        paths: {},
      },
    };
  });
}

function createLaunchJson(options: NgEssentialsOptions): Rule {
  return (host: Tree) => {
    if (!options.jest) {
      host.create(
        './.vscode/launch.json',
        `{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "ng serve",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:4200/#",
      "webRoot": "\${workspaceFolder}"
    },
    {
      "name": "ng test",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:9876/debug.html",
      "webRoot": "\${workspaceFolder}"
    }
  ]
}`
      );
    }

    return host;
  };
}
