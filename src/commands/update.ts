import path from 'path';
import { createRequire } from 'module';
import { detectPlatforms, getBaseDir, hasSkills } from '../core/detect.js';
import { copyCometSkillsForPlatform, getManifestSkills } from '../core/skills.js';
import { PLATFORMS } from '../core/platforms.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

interface UpdateOptions {
  json?: boolean;
  language?: string;
  scope?: 'global' | 'project';
}

export async function updateCommand(
  targetPath: string,
  options: UpdateOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const scope = options.scope ?? 'project';
  const languageSkillsDir = options.language === 'zh' ? 'skills-zh' : 'skills';
  const baseDir = getBaseDir(scope, projectPath);

  console.log(`\n  Comet Update v${version}\n`);
  console.log(
    `  Scope: ${scope === 'global' ? 'global (home directory)' : `project (${projectPath})`}`,
  );

  // Detect installed platforms
  const detected = await detectPlatforms(projectPath);
  if (detected.size === 0) {
    console.log('\n  No platforms detected. Run `comet init` first.\n');
    return;
  }

  const installedPlatforms = PLATFORMS.filter((p) => detected.has(p.id));

  // Filter to platforms that actually have comet skills installed
  const platformsToUpdate = [];
  for (const platform of installedPlatforms) {
    const hasComet = await hasSkills(baseDir, platform, 'comet');
    if (hasComet) platformsToUpdate.push(platform);
  }

  if (platformsToUpdate.length === 0) {
    console.log('\n  No platforms with comet skills installed. Run `comet init` first.\n');
    return;
  }

  console.log(`  Updating comet skills on ${platformsToUpdate.length} platform(s):`);
  for (const p of platformsToUpdate) {
    console.log(`    - ${p.name} (${p.skillsDir}/skills/)`);
  }

  // Copy skills for each platform (overwrite)
  console.log(`\n  Copying ${(await getManifestSkills()).length} skill files...\n`);

  let totalCopied = 0;
  for (const platform of platformsToUpdate) {
    const { copied, skipped } = await copyCometSkillsForPlatform(
      baseDir,
      platform,
      true,
      languageSkillsDir,
    );
    totalCopied += copied;
    console.log(`  ${platform.name}: ${copied} copied, ${skipped} skipped`);
  }

  console.log(`\n  Update complete — ${totalCopied} files updated.\n`);
}
