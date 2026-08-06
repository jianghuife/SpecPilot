export type KnowledgePriority = 'p0' | 'p1' | 'p2';

export interface KnowledgeTypePolicy {
  id: string;
  title: string;
  priority: KnowledgePriority;
  objective: string;
  recommended_locations: string[];
  update_when: string[];
  exact_paths?: string[];
  path_prefixes?: string[];
  path_suffixes?: string[];
}

export interface KnowledgeCoverage {
  id: string;
  title: string;
  priority: KnowledgePriority;
  objective: string;
  recommended_locations: string[];
  update_when: string[];
  status: 'covered' | 'template' | 'missing';
  matched_files: string[];
}

export const KNOWLEDGE_TYPE_POLICIES: KnowledgeTypePolicy[] = [
  {
    id: 'architecture-boundaries',
    title: 'Architecture boundaries',
    priority: 'p0',
    objective: 'Prevent changes from crossing domain, infrastructure, API, and worker boundaries.',
    recommended_locations: ['AGENTS.md', 'docs/architecture/', 'specs/project/architecture/'],
    update_when: ['Layer responsibilities, call direction, or deployment topology changes.'],
    exact_paths: ['AGENTS.md'],
    path_prefixes: ['docs/architecture/', 'specs/project/architecture/'],
  },
  {
    id: 'testing-verification',
    title: 'Testing and verification',
    priority: 'p0',
    objective: 'Tell agents how to prove a change correct with the project test seams.',
    recommended_locations: [
      'docs/testing.md',
      'specs/project/standards/testing.md',
      'module README files',
    ],
    update_when: ['Test commands, fixtures, mocks, coverage policy, or CI behavior changes.'],
    exact_paths: ['docs/testing.md', 'specs/project/standards/testing.md'],
    path_suffixes: ['/TESTING.md'],
  },
  {
    id: 'api-data-event-contracts',
    title: 'API, data, and event contracts',
    priority: 'p0',
    objective: 'Prevent DTO, schema, table, protocol, and event-field drift.',
    recommended_locations: [
      'openapi/',
      'proto/',
      'schema/',
      'docs/contracts/',
      'specs/project/contracts/',
    ],
    update_when: ['Interfaces, events, schemas, or table structures change.'],
    path_prefixes: ['openapi/', 'proto/', 'schema/', 'docs/contracts/', 'specs/project/contracts/'],
  },
  {
    id: 'state-machines-business-flows',
    title: 'State machines and business flows',
    priority: 'p0',
    objective:
      'Make state transitions, exceptional branches, permissions, and business meaning explicit.',
    recommended_locations: ['docs/domain/', 'specs/project/domain/'],
    update_when: ['States, enums, permissions, billing rules, or process steps change.'],
    path_prefixes: ['docs/domain/', 'specs/project/domain/'],
  },
  {
    id: 'architecture-decisions',
    title: 'Architecture decision records',
    priority: 'p1',
    objective: 'Preserve historical trade-offs and prevent repeated or contradictory choices.',
    recommended_locations: ['docs/adr/', 'specs/project/decisions/'],
    update_when: ['A consequential technology, boundary, or architectural trade-off is decided.'],
    path_prefixes: ['docs/adr/', 'specs/project/decisions/'],
  },
  {
    id: 'agent-skills',
    title: 'Agent skills',
    priority: 'p1',
    objective: 'Make recurring high-value workflows consistent and reviewable.',
    recommended_locations: ['.agents/skills/', 'assets/optional_skills/'],
    update_when: ['A task recurs or review repeatedly corrects the same execution mistake.'],
    path_prefixes: ['.agents/skills/', 'assets/optional_skills/'],
  },
  {
    id: 'standard-examples',
    title: 'Standard examples',
    priority: 'p1',
    objective: 'Give agents real, approved examples of project code and test style.',
    recommended_locations: ['docs/examples/', 'specs/project/examples/', 'module README files'],
    update_when: ['A new implementation pattern becomes stable.'],
    path_prefixes: ['docs/examples/', 'specs/project/examples/'],
    path_suffixes: ['/EXAMPLES.md'],
  },
  {
    id: 'runbooks',
    title: 'Operational runbooks',
    priority: 'p1',
    objective: 'Improve log analysis, diagnosis, mitigation, and repair verification.',
    recommended_locations: ['docs/runbooks/', 'specs/project/runbooks/'],
    update_when: ['An incident or investigation produces a reusable diagnostic procedure.'],
    path_prefixes: ['docs/runbooks/', 'specs/project/runbooks/'],
  },
  {
    id: 'incidents-postmortems',
    title: 'Incidents and postmortems',
    priority: 'p1',
    objective: 'Turn consequential failures into durable engineering knowledge.',
    recommended_locations: ['incidents/', 'docs/incidents/', 'specs/project/incidents/'],
    update_when: ['A P0, P1, P2, or otherwise consequential failure occurs.'],
    path_prefixes: ['incidents/', 'docs/incidents/', 'specs/project/incidents/'],
  },
  {
    id: 'anti-patterns',
    title: 'Anti-pattern library',
    priority: 'p1',
    objective: 'Prevent agents from repeating known project-specific mistakes.',
    recommended_locations: ['docs/anti-patterns.md', 'specs/project/anti-patterns.md'],
    update_when: ['The same review issue or failure mode appears more than once.'],
    exact_paths: ['docs/anti-patterns.md', 'specs/project/anti-patterns.md'],
  },
  {
    id: 'domain-glossary',
    title: 'Domain glossary',
    priority: 'p1',
    objective: 'Keep business terms, product concepts, and state names unambiguous.',
    recommended_locations: ['docs/domain/glossary.md', 'specs/project/glossary.md'],
    update_when: ['A domain concept or canonical name is introduced or changed.'],
    exact_paths: ['docs/domain/glossary.md', 'specs/project/glossary.md'],
  },
  {
    id: 'ai-evaluations',
    title: 'AI evaluation sets',
    priority: 'p1',
    objective: 'Measure whether agent behavior actually improves on representative project tasks.',
    recommended_locations: ['docs/ai/evals/', 'specs/project/ai/evals/'],
    update_when: ['An agent failure, high-frequency task, or major business rule is identified.'],
    path_prefixes: ['docs/ai/evals/', 'specs/project/ai/evals/'],
  },
  {
    id: 'performance-capacity-security',
    title: 'Performance, capacity, and security constraints',
    priority: 'p2',
    objective:
      'Preserve non-functional limits, threat boundaries, and operational risk constraints.',
    recommended_locations: [
      'docs/performance/',
      'docs/security/',
      'specs/project/performance/',
      'specs/project/security/',
    ],
    update_when: ['SLA, data scale, authorization, threat model, or security policy changes.'],
    path_prefixes: [
      'docs/performance/',
      'docs/security/',
      'specs/project/performance/',
      'specs/project/security/',
    ],
  },
];

export const PROJECT_KNOWLEDGE_TEMPLATES: Record<string, string> = {
  'specs/project/architecture/boundaries.md': `<!-- specpilot-template:architecture-boundaries -->
# Architecture Boundaries

Document layer ownership, permitted dependency directions, deployment boundaries, and forbidden calls.

## Components and ownership

## Allowed dependency directions

## Deployment topology

## Update trigger

Update when layer responsibilities, call direction, or deployment topology changes.
`,
  'specs/project/standards/testing.md': `<!-- specpilot-template:testing-verification -->
# Testing and Verification

Document commands, test seams, fixtures, mocks, CI expectations, and the evidence required for each change type.

## Commands

## Test seams and fixtures

## CI and coverage

## Update trigger

Update when test commands, fixtures, mocks, coverage policy, or CI behavior changes.
`,
  'specs/project/contracts/README.md': `<!-- specpilot-template:api-data-event-contracts -->
# API, Data, and Event Contracts

Link canonical OpenAPI, protocol, schema, table, and event definitions. Record compatibility rules and owners.

## Canonical contracts

## Compatibility rules

## Update trigger

Update when interfaces, events, schemas, or table structures change.
`,
  'specs/project/domain/workflows.md': `<!-- specpilot-template:state-machines-business-flows -->
# State Machines and Business Flows

Document states, permitted transitions, exceptional branches, permissions, billing effects, and invariants.

## States and transitions

## Exceptional branches

## Permissions and invariants

## Update trigger

Update when states, enums, permissions, billing rules, or process steps change.
`,
  'specs/project/examples/README.md': `<!-- specpilot-template:standard-examples -->
# Standard Examples

Link small, current examples that demonstrate approved implementation and test patterns.

## Examples

## Update trigger

Update when a new implementation pattern becomes stable.
`,
  'specs/project/runbooks/README.md': `<!-- specpilot-template:runbooks -->
# Operational Runbooks

Document symptoms, diagnostic queries, mitigation, repair, and verification for recurring operations.
`,
  'specs/project/incidents/README.md': `<!-- specpilot-template:incidents-postmortems -->
# Incidents and Postmortems

Record impact, timeline, root cause, contributing factors, corrective actions, and linked runbook updates.
`,
  'specs/project/anti-patterns.md': `<!-- specpilot-template:anti-patterns -->
# Project Anti-patterns

Record repeated project-specific mistakes, why they fail, the preferred pattern, and representative evidence.
`,
  'specs/project/ai/evals/README.md': `<!-- specpilot-template:ai-evaluations -->
# AI Evaluation Set

Store representative prompts, expected constraints, required evidence, and pass/fail rubrics. Never store secrets or raw private sessions.
`,
  'specs/project/performance/README.md': `<!-- specpilot-template:performance-capacity-security -->
# Performance and Capacity Constraints

Document SLAs, workload shape, data scale, resource ceilings, benchmarks, and capacity assumptions.
`,
  'specs/project/security/README.md': `<!-- specpilot-template:performance-capacity-security -->
# Security Constraints

Document trust boundaries, authorization rules, sensitive data handling, threat assumptions, and required security checks.
`,
};

export function knowledgePoliciesForPath(filePath: string): KnowledgeTypePolicy[] {
  return KNOWLEDGE_TYPE_POLICIES.filter((policy) => matchesPolicy(filePath, policy));
}

function matchesPolicy(filePath: string, policy: KnowledgeTypePolicy): boolean {
  return (
    policy.exact_paths?.includes(filePath) === true ||
    policy.path_prefixes?.some((prefix) => filePath.startsWith(prefix)) === true ||
    policy.path_suffixes?.some((suffix) => filePath.endsWith(suffix)) === true
  );
}

export function assessKnowledgeCoverage(
  files: readonly { path: string; templateId?: string }[],
): KnowledgeCoverage[] {
  return KNOWLEDGE_TYPE_POLICIES.map((policy) => {
    const matched = files.filter((file) => matchesPolicy(file.path, policy));
    const covered = matched.filter((file) => file.templateId !== policy.id);
    return {
      id: policy.id,
      title: policy.title,
      priority: policy.priority,
      objective: policy.objective,
      recommended_locations: [...policy.recommended_locations],
      update_when: [...policy.update_when],
      status: covered.length > 0 ? 'covered' : matched.length > 0 ? 'template' : 'missing',
      matched_files: matched.map((file) => file.path).sort(),
    };
  });
}
