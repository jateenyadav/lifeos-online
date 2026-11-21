/** Generated avatars: a rounded square with a 2-colour mesh and initials (docs/DESIGN.md). */
export const avatarPairs = [
  ['#34D399', '#2DD4BF'],
  ['#38BDF8', '#C084FC'],
  ['#FB7185', '#F472B6'],
  ['#FBBF24', '#FB7185'],
  ['#2DD4BF', '#38BDF8'],
  ['#A3E635', '#34D399'],
  ['#F472B6', '#C084FC'],
  ['#C084FC', '#38BDF8'],
];

export function nameHash(name = '') {
  let hash = 0;
  for (const char of name.trim().toLowerCase())
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash;
}
export function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = [...words[0]][0] ?? '';
  const last = words.length > 1 ? ([...words.at(-1)][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export default function Avatar({
  name,
  pair,
  size = 40,
  status = false,
  className = '',
}) {
  const index = Number.isInteger(pair)
    ? ((pair % avatarPairs.length) + avatarPairs.length) % avatarPairs.length
    : nameHash(name) % avatarPairs.length;
  const [a, b] = avatarPairs[index];
  return (
    <span
      className={`avatar ${className}`}
      aria-hidden="true"
      data-pair={index}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        borderRadius: Math.round(size * 0.32),
        backgroundImage: `radial-gradient(circle at 18% 12%, ${a} 0%, transparent 62%), radial-gradient(circle at 88% 92%, ${b} 0%, transparent 66%), linear-gradient(135deg, ${a}, ${b})`,
      }}
    >
      {initials(name)}
      {status && <i className="avatar-dot" />}
    </span>
  );
}
