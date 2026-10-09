// Small language models often wrap JSON in prose or code fences, or leave a
// trailing comma. Pull out the first JSON object and tidy it up.

export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('no JSON object in the answer');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return parseLoose(text.slice(start, i + 1));
    }
  }
  // Cut off (ran out of tokens): try closing the open brackets.
  return parseLoose(closeOpen(text.slice(start)));
}

function parseLoose(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const fixed = s
      .replace(/,\s*([}\]])/g, '$1') // trailing commas
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":') // unquoted keys
      .replace(/:\s*'([^']*)'/g, ': "$1"'); // single-quoted values
    return JSON.parse(fixed);
  }
}

function closeOpen(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const c of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let out = s.replace(/,\s*$/, '');
  if (inStr) out += '"';
  return out + stack.reverse().join('');
}
