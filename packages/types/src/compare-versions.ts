/**
 * Compare two semver version strings.
 * Returns the type of update available, or null if current >= latest.
 */
export function compareVersions(
  current: string,
  latest: string,
): 'major' | 'minor' | 'patch' | null {
  const parse = (v: string) => {
    const clean = v.replace(/^v/, '');
    const [major, minor, patch] = clean.split('.').map(Number);
    return { major: major ?? 0, minor: minor ?? 0, patch: patch ?? 0 };
  };

  const c = parse(current);
  const l = parse(latest);

  if (l.major > c.major) return 'major';
  if (l.major === c.major && l.minor > c.minor) return 'minor';
  if (l.major === c.major && l.minor === c.minor && l.patch > c.patch)
    return 'patch';
  return null;
}
