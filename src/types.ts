import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as { version: string };

export const SPEC_PILOT_VERSION = packageMetadata.version;

export type Host = 'claude' | 'codex';
export type GraphMode = 'codegraph' | 'none';

export interface ProjectConfig {
  schema_version: 1;
  managed_version: string;
  language: 'en';
  hosts: Host[];
  graph: {
    provider: GraphMode;
    required: false;
  };
}

export interface InitializeOptions {
  projectPath: string;
  hosts: Host[];
  graph: GraphMode;
  dryRun?: boolean;
}

export interface InitializeResult {
  projectPath: string;
  changed: boolean;
  plannedPaths: string[];
  writtenPaths: string[];
  warnings: string[];
}
