import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as { version: string };

export const SPEC_PILOT_VERSION = packageMetadata.version;
export const DEFAULT_CONTEXT_MAX_BYTES = 131_072;

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
  context: {
    per_turn_state: boolean;
    max_bytes: number;
  };
  optional_skills: string[];
}

export interface InitializeOptions {
  projectPath: string;
  hosts: Host[];
  graph: GraphMode;
  perTurnState?: boolean;
  contextMaxBytes?: number;
  optionalSkills?: string[];
  dryRun?: boolean;
}

export interface InitializeResult {
  projectPath: string;
  changed: boolean;
  plannedPaths: string[];
  writtenPaths: string[];
  warnings: string[];
}
