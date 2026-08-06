# Knowledge and Context Evaluation Set

`context-routing.jsonl` is a versioned evaluation set for SpecPilot's knowledge policy and
context selector. Each case names a representative engineering request, the knowledge type that
must be considered, and its required priority.

Add a case when an agent misses a project constraint, repeatedly loads irrelevant context, or a
new high-frequency workflow appears. Keep prompts synthetic and free of secrets or raw private
sessions. A policy change is incomplete until the evaluation set and its regression test agree.

The deterministic regression test verifies taxonomy coverage and priority. Product-level agent
evaluations can additionally score whether a host agent reads the expected artifacts, cites their
sources, respects the byte budget, and refuses stale or conflicting knowledge.
