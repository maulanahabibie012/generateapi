/**
 * Parse a single TXT file content into { curl, responseJson }.
 *
 * Strategy:
 * 1. Detect explicit CURL: / RESPONSE: markers if present
 * 2. Otherwise, locate the cURL command by finding a line starting with `curl`,
 *    then track line continuations (`\` or `^`) to find where the cURL ends.
 * 3. Search the remaining text for balanced JSON blocks and pick the best one.
 */
export function parseTxtFile(content) {
  if (!content || typeof content !== 'string') {
    return { curl: '', responseJson: '' };
  }

  const text = content.replace(/\r\n/g, '\n').trim();

  // Format B: explicit markers
  const curlMarker = /^CURL:\s*$/im;
  const responseMarker = /^RESPONSE:\s*$/im;

  if (curlMarker.test(text) && responseMarker.test(text)) {
    const curlMatch = text.match(/^CURL:\s*\n([\s\S]*?)(?=^RESPONSE:\s*$)/im);
    const responseMatch = text.match(/^RESPONSE:\s*\n([\s\S]*)/im);
    const curl = curlMatch ? curlMatch[1].trim() : '';
    const responseRaw = responseMatch ? responseMatch[1].trim() : '';
    return { curl, responseJson: pickBestJsonBlock(responseRaw) };
  }

  const lines = text.split('\n');

  // Locate the start of the cURL command (line starting with "curl ")
  let curlStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*curl\s/i.test(lines[i])) {
      curlStart = i;
      break;
    }
  }

  if (curlStart === -1) {
    // No cURL found; treat all balanced JSON as response, leave curl empty
    return { curl: '', responseJson: pickBestJsonBlock(text) };
  }

  // Determine where the cURL command ends by tracking backslash/caret continuations
  let curlEnd = curlStart;
  for (let i = curlStart; i < lines.length; i++) {
    curlEnd = i;
    const trimmed = lines[i].trimEnd();
    const continues = trimmed.endsWith('\\') || trimmed.endsWith('^');
    if (!continues) break;
  }

  const curl = lines.slice(curlStart, curlEnd + 1).join('\n').trim();
  const afterCurl = lines.slice(curlEnd + 1).join('\n');
  const beforeCurl = lines.slice(0, curlStart).join('\n');

  // Search for JSON in the text after the cURL first; fall back to before-cURL
  let responseJson = pickBestJsonBlock(afterCurl);
  if (!responseJson && beforeCurl.trim()) {
    responseJson = pickBestJsonBlock(beforeCurl);
  }

  return { curl, responseJson };
}

/**
 * Extract all balanced JSON blocks from a string and pick the most likely
 * response body. Prefers blocks containing `status_code`, `meta`, or `data`.
 */
function pickBestJsonBlock(text) {
  if (!text) return '';

  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0];

  // Score each block by how "response-like" it looks
  const preferKeys = ['status_code', 'status_desc', 'status_description', 'meta', 'data'];
  let bestBlock = blocks[0];
  let bestScore = -1;

  for (const block of blocks) {
    let score = 0;
    for (const key of preferKeys) {
      if (block.includes(`"${key}"`)) score += 10;
    }
    // Prefer larger blocks (likely more complete response)
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
 * Handles strings with quotes and escapes correctly.
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
              // Not valid JSON, skip
            }
            i = j + 1;
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        // Unbalanced from this position; skip this opening char and continue
        i++;
      }
    } else {
      i++;
    }
  }

  return blocks;
}
