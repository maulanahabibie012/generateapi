/**
 * Parse a single TXT file content into { curl, responseJson }.
 *
 * Robust against files that contain:
 * - Multiple JSON blocks (request + response)
 * - Trailing text after the JSON response
 * - Various separator styles
 *
 * Strategy:
 * 1. Detect explicit CURL: / RESPONSE: markers if present
 * 2. Otherwise, extract the cURL command (lines starting with `curl` plus continuation)
 *    and find all balanced JSON blocks in the rest of the file.
 * 3. Prefer JSON blocks that contain `status_code` or `meta` (the response).
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

  // Find where the cURL ends and JSON starts
  const lines = text.split('\n');
  let firstJsonLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && !trimmed.startsWith('curl')) {
      firstJsonLine = i;
      break;
    }
  }

  let curl = '';
  let afterCurl = text;

  if (firstJsonLine !== -1) {
    curl = lines.slice(0, firstJsonLine).join('\n').trim();
    afterCurl = lines.slice(firstJsonLine).join('\n');
  } else {
    // No JSON block detected; entire content is cURL
    return { curl: text, responseJson: '' };
  }

  return { curl, responseJson: pickBestJsonBlock(afterCurl) };
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
      let start = i;

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
            // Validate it parses
            try {
              JSON.parse(candidate);
              blocks.push(candidate);
            } catch {
              // Not valid JSON, skip
            }
            i = j + 1;
            break;
          }
        }
      }

      // If we exited the inner loop without finding a balanced close, stop
      if (depth !== 0) break;
    } else {
      i++;
    }
  }

  return blocks;
}
