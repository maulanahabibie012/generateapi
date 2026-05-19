/**
 * Parse a single TXT file content into { curl, responseJson }.
 *
 * Lenient parser that handles many real-world TXT formats:
 * - Markdown code fences (```bash / ```curl / ```)
 * - "Request:", "Sample request:", "RESPONSE:", "Response:" labels
 * - Preamble text before the cURL
 * - Multiple JSON blocks (request body, sample response, etc.)
 * - Trailing notes after the JSON response
 */
export function parseTxtFile(content) {
  if (!content || typeof content !== 'string') {
    return { curl: '', responseJson: '' };
  }

  // Normalize line endings and strip markdown code fences
  let text = content.replace(/\r\n/g, '\n');
  text = text.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
  text = text.trim();

  // Format B: explicit RESPONSE: marker
  const responseMarker = /^\s*RESPONSE\s*:?\s*$/im;
  if (responseMarker.test(text)) {
    const splitIdx = text.search(responseMarker);
    const beforeResponse = text.substring(0, splitIdx);
    const afterResponse = text.replace(/^[\s\S]*?^\s*RESPONSE\s*:?\s*$\n?/im, '');
    const curl = extractCurlBlock(beforeResponse);
    const responseJson = pickBestJsonBlock(afterResponse) || pickBestJsonBlock(beforeResponse);
    return { curl, responseJson };
  }

  // General case: locate cURL anywhere in the text
  const curl = extractCurlBlock(text);
  let responseJson = '';

  if (curl) {
    // Search for JSON in text after the cURL block
    const curlEndIdx = text.indexOf(curl) + curl.length;
    const afterCurl = text.substring(curlEndIdx);
    const beforeCurl = text.substring(0, text.indexOf(curl));

    responseJson = pickBestJsonBlock(afterCurl);
    if (!responseJson) {
      responseJson = pickBestJsonBlock(beforeCurl);
    }
  } else {
    // No cURL detected; pick any JSON block as the response
    responseJson = pickBestJsonBlock(text);
  }

  return { curl, responseJson };
}

/**
 * Extract a cURL command from text. Accepts the cURL appearing anywhere
 * (with or without indentation), and tracks line continuations via
 * trailing backslash, caret (Windows), or pipe-quoted continuation.
 */
function extractCurlBlock(text) {
  if (!text) return '';
  const lines = text.split('\n');

  // Find the first line containing the curl invocation token
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Match "curl ", "curl.exe ", or curl as the token (not part of another word)
    if (/(?:^|\s)curl(?:\.exe)?(?:\s|$)/i.test(trimmed)) {
      // Avoid false positives where "curl" is just a word in prose
      // We require the line to look like a command: contains a flag or URL
      if (
        trimmed.toLowerCase().startsWith('curl') ||
        trimmed.toLowerCase().includes('curl ') ||
        /-[xXhHdD]\b/.test(trimmed) ||
        /https?:\/\//.test(trimmed)
      ) {
        startIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) return '';

  // Trim everything before the "curl" token on the start line
  const startLine = lines[startIdx];
  const curlPos = startLine.search(/curl(?:\.exe)?\b/i);
  let firstLine = curlPos >= 0 ? startLine.substring(curlPos) : startLine;

  const collected = [firstLine];
  let inSingleQuote = countUnescaped(firstLine, "'") % 2 === 1;
  let inDoubleQuote = countUnescaped(firstLine, '"') % 2 === 1;
  let continues =
    /\\\s*$/.test(firstLine) ||
    /\^\s*$/.test(firstLine) ||
    inSingleQuote ||
    inDoubleQuote;

  for (let i = startIdx + 1; i < lines.length && continues; i++) {
    const ln = lines[i];
    collected.push(ln);
    if (inSingleQuote) {
      inSingleQuote = (countUnescaped(ln, "'") % 2 === 0) ? false : true;
    } else if (inDoubleQuote) {
      inDoubleQuote = (countUnescaped(ln, '"') % 2 === 0) ? false : true;
    } else {
      // Update quote state based on this line
      const sq = countUnescaped(ln, "'") % 2 === 1;
      const dq = countUnescaped(ln, '"') % 2 === 1;
      if (sq) inSingleQuote = true;
      if (dq) inDoubleQuote = true;
    }
    continues =
      /\\\s*$/.test(ln) ||
      /\^\s*$/.test(ln) ||
      inSingleQuote ||
      inDoubleQuote;
  }

  return collected.join('\n').trim();
}

/**
 * Count unescaped occurrences of a quote character on a single line.
 */
function countUnescaped(line, quoteChar) {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === quoteChar && line[i - 1] !== '\\') {
      count++;
    }
  }
  return count;
}

/**
 * Extract all balanced JSON blocks from text and pick the most response-like one.
 */
function pickBestJsonBlock(text) {
  if (!text) return '';

  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0];

  const preferKeys = ['status_code', 'status_desc', 'status_description', 'meta', 'data'];
  let bestBlock = blocks[0];
  let bestScore = -1;

  for (const block of blocks) {
    let score = 0;
    for (const key of preferKeys) {
      if (block.includes(`"${key}"`)) score += 10;
    }
    score += Math.min(block.length / 100, 5);
    if (score > bestScore) {
      bestScore = score;
      bestBlock = block;
    }
  }

  return bestBlock;
}

/**
 * Extract all balanced JSON blocks (objects or arrays) from a string.
 */
function extractJsonBlocks(text) {
  const blocks = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text[i];
    if (c === '{' || c === '[') {
      const openChar = c;
      const closeChar = c === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escape = false;
      const start = i;
      let consumed = false;

      for (let j = i; j < len; j++) {
        const ch = text[j];

        if (escape) {
          escape = false;
          continue;
        }

        if (inString) {
          if (ch === '\\') {
            escape = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
        } else if (ch === openChar) {
          depth++;
        } else if (ch === closeChar) {
          depth--;
          if (depth === 0) {
            const candidate = text.substring(start, j + 1).trim();
            try {
              JSON.parse(candidate);
              blocks.push(candidate);
            } catch {
              // skip
            }
            i = j + 1;
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        i++;
      }
    } else {
      i++;
    }
  }

  return blocks;
}
