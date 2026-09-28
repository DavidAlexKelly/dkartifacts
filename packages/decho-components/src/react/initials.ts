/**
 * Initials from a display name.
 *
 * Its own module because `Avatar.tsx` should export a component and nothing
 * else — a file that exports both is a file fast refresh gives up on — and
 * because this is worth testing on its own.
 *
 * NOT `name[0] + name[1]`, which is what the hand-rolled versions do, so "Dana
 * Okafor" comes out as "DA". Nor a blind `split(" ")`: "Maria del Carmen
 * Rodríguez" is MR rather than MD, and "李雷" is one character that must stay
 * one character.
 */

/** The first *character*, not the first UTF-16 code unit. */
function firstCharacter(word: string): string {
  return [...word][0] ?? "";
}

/**
 * Words that are part of a surname rather than a name of their own.
 *
 * Deliberately short and Latin-script: a longer list starts making decisions
 * about names it does not understand, and the failure mode of a missing
 * particle (an initial that is one letter off) is far milder than the failure
 * mode of over-reach (a name mangled by a rule written for a different
 * language).
 */
const PARTICLES = new Set([
  "de",
  "del",
  "della",
  "der",
  "di",
  "do",
  "dos",
  "du",
  "la",
  "le",
  "van",
  "von",
  "bin",
  "al",
]);

export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !PARTICLES.has(word.toLowerCase()));

  if (words.length === 0) {
    return "";
  }
  const first = firstCharacter(words[0] ?? "");
  if (words.length === 1) {
    return first.toUpperCase();
  }
  const last = firstCharacter(words[words.length - 1] ?? "");
  return `${first}${last}`.toUpperCase();
}
