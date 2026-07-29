import { rm } from 'node:fs/promises';
import { readJsonObjectFile, writeJsonAtomic } from '../utils/files.js';
import { isJsonObject, type JsonObject } from '../utils/json.js';

const PROMPT_CONTEXT_COMMAND = 'specpilot internal prompt-context';

function groupHasPromptContextHook(group: unknown): boolean {
  if (!isJsonObject(group)) return false;
  const hooks = group.hooks;
  return (
    Array.isArray(hooks) &&
    hooks.some((hook) => isJsonObject(hook) && hook.command === PROMPT_CONTEXT_COMMAND)
  );
}

export function containsPromptContextHook(settings: JsonObject): boolean {
  const hooks = settings.hooks;
  if (!isJsonObject(hooks)) return false;
  return Object.values(hooks).some(
    (groups) => Array.isArray(groups) && groups.some(groupHasPromptContextHook),
  );
}

export function withPromptContextHook(settings: JsonObject, sourceHooks: JsonObject): JsonObject {
  const merged = { ...settings };
  const hooks: JsonObject = isJsonObject(merged.hooks) ? { ...merged.hooks } : {};
  for (const [event, sourceGroups] of Object.entries(sourceHooks)) {
    if (!Array.isArray(sourceGroups)) continue;
    const groups = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
    if (!groups.some(groupHasPromptContextHook)) {
      groups.push(...sourceGroups.filter(groupHasPromptContextHook));
    }
    hooks[event] = groups;
  }
  merged.hooks = hooks;
  return merged;
}

function withoutPromptContextHook(settings: JsonObject): JsonObject {
  const merged = { ...settings };
  if (!isJsonObject(merged.hooks)) return merged;
  const hooks: JsonObject = { ...merged.hooks };
  for (const [event, groupsValue] of Object.entries(hooks)) {
    if (!Array.isArray(groupsValue)) continue;
    const groups = groupsValue
      .map((group) => {
        if (!isJsonObject(group) || !Array.isArray(group.hooks)) return group;
        const remaining = group.hooks.filter(
          (hook) => !(isJsonObject(hook) && hook.command === PROMPT_CONTEXT_COMMAND),
        );
        return remaining.length === 0 ? undefined : { ...group, hooks: remaining };
      })
      .filter((group) => group !== undefined);
    if (groups.length === 0) delete hooks[event];
    else hooks[event] = groups;
  }
  if (Object.keys(hooks).length === 0) delete merged.hooks;
  else merged.hooks = hooks;
  return merged;
}

export async function removePromptContextHook(
  filePath: string,
): Promise<'removed' | 'absent' | 'unreadable'> {
  let settings: JsonObject | undefined;
  try {
    settings = await readJsonObjectFile(filePath);
  } catch {
    return 'unreadable';
  }
  if (!settings || !containsPromptContextHook(settings)) return 'absent';
  const pruned = withoutPromptContextHook(settings);
  if (Object.keys(pruned).length === 0) {
    await rm(filePath, { force: true });
  } else {
    await writeJsonAtomic(filePath, pruned);
  }
  return 'removed';
}
