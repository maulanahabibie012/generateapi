/**
 * Parse a single TXT file content into { curl, responseJson, expectedStatus }.
 *
 * Lenient parser that handles many real-world TXT formats:
 * - Markdown code fences (```bash / ```curl / ```)
 * - "Request:", "Sample request:", "RESPONSE:", "Response:" labels
 * - Preamble text before the cURL
 * - Multiple JSON blocks (request body, sample response, etc.)
 * - Trailing notes after the JSON response
 * - Expected status code after "RESPONSE\n=========" pattern
 */
export function parseTxtFile(content) {
  if (!content || typeof content !== 'string') {
    return { curl: '', responseJson: '', expectedStatus: 0 };
  }

  // Normalize line endings and strip markdown code fences
  let text = content.replace(/\r\n/g, '\n');
  text = text.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
  text = text.trim();

  // Extract expected status code from "RESPONSE\n=====" pattern
  let expectedStatus = extractExpectedStatus(text);

  // Format B: explicit RESPONSE: marker or "RESPONSE\n=====" pattern
  const responseMarker = /^\s*RESPONSE\s*:?\s*$/im;
  const responseHeaderPattern = /RESPONSE\s*\n\s*[=]+\s*\n?/i;
  
  if (responseMarker.test(text) || responseHeaderPattern.test(text)) {
    // Find where RESPONSE section starts
    let splitIdx = -1;
    let afterResponse = '';
    
    // Check for "RESPONSE\n=====" pattern first
    const headerMatch = text.match(responseHeaderPattern);
    if (headerMatch) {
      splitIdx = text.search(responseHeaderPattern);
      afterResponse = text.substring(splitIdx + headerMatch[0].length);
    } else if (responseMarker.test(text)) {
      splitIdx = text.search(responseMarker);
      afterResponse = text.replace(/^[\s\S]*?^\s*RESPONSE\s*:?\s*$\n?/im, '');
    }
    
    const beforeResponse = splitIdx >= 0 ? text.substring(0, splitIdx) : text;
    const curl = extractCurlBlock(beforeResponse);
    const responseJson = pickBestJsonBlock(afterResponse) || pickBestJsonBlock(beforeResponse);
    return { curl, responseJson, expectedStatus };
  }

  // General case: locate cURL anywhere in the text
  const curl = extractCurlBlock(text);
  let responseJson = '';

  if (curl) {
    // Search for JSON in text after the cURL block
    const curlEndIdx = text.indexOf(curl) + curl.length;
    const afterCurl = text.substring(curlEndIdx);

    // Always pick the LAST JSON block in afterCurl (typically the API response after HTTP headers)
    responseJson = pickLastJsonBlock(afterCurl);
  } else {
    // No cURL detected; pick any JSON block as the response
    responseJson = pickBestJsonBlock(text);
  }

  return { curl, responseJson, expectedStatus };
}

/**
 * Extract expected status code from text.
 * Searches for:
 * 1. First 3-digit integer after "RESPONSE\n=====" header marker
 * 2. HTTP/1.1 xxx pattern (e.g., "HTTP/1.1 200")
 * Returns 0 if no status code found.
 */
function extractExpectedStatus(text) {
  // Try to find status code after "RESPONSE\n====" header first
  const headerMatch = text.match(/RESPONSE\s*\n\s*[=]+/i);
  if (headerMatch) {
    const headerEndIdx = headerMatch.index + headerMatch[0].length;
    const afterHeader = text.substring(headerEndIdx);
    
    // Find the first 3-digit integer in the text after the header
    // Use word boundary to ensure it's a standalone 3-digit number
    const statusMatch = afterHeader.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const code = parseInt(statusMatch[1], 10);
      if (code >= 100 && code < 600) {
        return code;
      }
    }
  }
  
  // Try to find HTTP/1.1 xxx pattern
  const httpMatch = text.match(/HTTP\/1\.\d+\s+(\d{3})/i);
  if (httpMatch) {
    const code = parseInt(httpMatch[1], 10);
    if (code >= 100 && code < 600) {
      return code;
    }
  }
  
  // Default to 0 if no status code found
  return 0;
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
    
    // Skip "CURL" header line
    if (/^CURL$/i.test(trimmed)) {
      continue;
    }
    
    // Skip separator lines like "=====" or "-----"
    if (/^[=:\-]+$/.test(trimmed)) {
      continue;
    }
    
    // Skip single-line patterns like "CURL ====="
    if (/^CURL\s*[=:\-]+$/i.test(trimmed)) {
      continue;
    }
    
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
 * Extract the LAST JSON block from text.
 * Used for finding the actual API response after HTTP headers.
 */
function pickLastJsonBlock(text) {
  if (!text) return '';

  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) return '';
  
  // Return the last block
  return blocks[blocks.length - 1];
}

/**
 * Extract all balanced JSON blocks from text and pick the most response-like one.
 * Prefers the last JSON block (typically the actual API response after HTTP headers).
 */
function pickBestJsonBlock(text) {
  if (!text) return '';

  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0];

  const preferKeys = ['status_code', 'status_desc', 'status_description', 'meta', 'data'];
  let bestBlock = blocks[0];
  let bestScore = -1;

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    let score = 0;
    for (const key of preferKeys) {
      if (block.includes(`"${key}"`)) score += 10;
    }
    score += Math.min(block.length / 100, 5);
    // Prefer later blocks (higher index = later in text = likely the response)
    score += blockIdx * 0.5;
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
