/** Compare actual displayed values; currency symbols and grouping are not digits. */
export function rollingDirection(previous: string, next: string): 'up' | 'down' {
  const number = (text: string) => {
    const normalized = text.replace(/[−–]/g, '-').replace(/[^\d.+-]/g, '');
    const match = normalized.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)/);
    return match ? Number(match[0]) : NaN;
  };
  const from = number(previous), to = number(next);
  return Number.isFinite(from) && Number.isFinite(to) && to < from ? 'down' : 'up';
}

export function rollingDigits(previous: string, next: string) {
  const old = [...previous], current = [...next];
  return current.map((character, index) => {
    const before = old[old.length - current.length + index];
    return {character, old: before && /\d/.test(before) ? before : ' ',
      changed: /\d/.test(character) && before !== character, place: current.length - index - 1};
  });
}
