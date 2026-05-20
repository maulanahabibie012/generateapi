/**
 * Parse a cURL command string into its components: method, url, headers, body.
 *
 * Supports:
 * - Multi-line cURL (backslash + newline continuations)
 * - Single and double quoted arguments
 * - -X / --request, -H / --header, -d / --data, --data-raw, --data-binary
 * - Defaults method to POST when a body is present and no -X is given
 */
export function parseCurl(curlCommand) {
  if (!curlCommand || typeof curlCommand !== 'string') {
    return { method: 'GET', url: '', headers: {}, body: '' };
  }

  // Normalize line continuations and Windows ^ caret continuations
  const normalized = curlCommand
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^\r?\n/g, ' ')
    .trim();

  const tokens = tokenize(normalized);

  // Strip the leading "curl" if present
  if (tokens.length && tokens[0].toLowerCase() === 'curl') {
    tokens.shift();
  }

  let method = null;
  let url = '';
  const headers = {};
  let body = '';

  const dataFlags = new Set([
    '-d',
    '--data',
    '--data-raw',
    '--data-binary',
    '--data-ascii',
    '--data-urlencode',
  ]);

  const noArgFlags = new Set([
    '--compressed',
    '-i',
    '--include',
    '-v',
    '--verbose',
    '-k',
    '--insecure',
    '-L',
    '--location',
    '-s',
    '--silent',
    '-S',
    '--show-error',
    '-O',
    '--remote-name',
    '-J',
    '--remote-header-name',
    '-f',
    '--fail',
    '--http2',
    '--http1.1',
    '--http1.0',
    '-g',
    '--globoff',
    '--resolve',
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === '-X' || t === '--request') {
      method = (tokens[++i] || '').toUpperCase();
    } else if (t === '-H' || t === '--header') {
      const h = tokens[++i] || '';
      const colonIdx = h.indexOf(':');
      if (colonIdx !== -1) {
        const key = h.substring(0, colonIdx).trim();
        const val = h.substring(colonIdx + 1).trim();
        if (key) headers[key] = val;
      }
    } else if (dataFlags.has(t)) {
      body = tokens[++i] || '';
    } else if (t === '-u' || t === '--user') {
      // basic auth: skip the value (not modeled in the template)
      i++;
    } else if (t === '-A' || t === '--user-agent') {
      const ua = tokens[++i] || '';
      if (ua) headers['User-Agent'] = ua;
    } else if (t === '-e' || t === '--referer') {
      const ref = tokens[++i] || '';
      if (ref) headers['Referer'] = ref;
    } else if (t === '--url') {
      url = tokens[++i] || url;
    } else if (noArgFlags.has(t)) {
      // flag with no argument
    } else if (t.startsWith('-')) {
      // unknown option; ignore safely
    } else {
      // positional argument: treat the first as the URL
      if (!url) url = t;
    }
  }

  if (!method) {
    method = body ? 'POST' : 'GET';
  }

  return { method, url, headers, body };
}

/**
 * Shell-style tokenizer that respects single/double quotes and backslash escapes.
 */
function tokenize(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(input[i])) i++;
    if (i >= len) break;

    let token = '';
    let inToken = true;

    while (i < len && inToken) {
      const c = input[i];

      if (/\s/.test(c)) {
        inToken = false;
        break;
      }

      if (c === "'") {
        // Single-quoted: literal until next single quote
        i++;
        while (i < len && input[i] !== "'") {
          token += input[i];
          i++;
        }
        if (i < len) i++; // skip closing quote
        continue;
      }

      if (c === '"') {
        // Double-quoted: process \" \\ \$ \` escapes; otherwise literal
        i++;
        while (i < len && input[i] !== '"') {
          if (input[i] === '\\' && i + 1 < len) {
            const next = input[i + 1];
            if (next === '"' || next === '\\' || next === '$' || next === '`' || next === '\n') {
              if (next !== '\n') token += next;
              i += 2;
              continue;
            }
          }
          token += input[i];
          i++;
        }
        if (i < len) i++; // skip closing quote
        continue;
      }

      if (c === '\\' && i + 1 < len) {
        token += input[i + 1];
        i += 2;
        continue;
      }

      token += c;
      i++;
    }

    tokens.push(token);
  }

  return tokens;
}
