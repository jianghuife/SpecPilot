const SPEC_PILOT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isSpecPilotId(value: string): boolean {
  return SPEC_PILOT_ID_PATTERN.test(value);
}

export function assertSpecPilotId(value: string, label: string): string {
  if (!isSpecPilotId(value)) {
    throw new Error(`invalid ${label}: ${value} (use lowercase letters, digits, and hyphens)`);
  }
  return value;
}
