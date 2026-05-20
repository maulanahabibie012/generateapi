/**
 * Clean cURL input by removing header lines like "CURL\n=====" or similar markers
 * and extracting the actual cURL command.
 */
export function cleanCurlInput(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const lines = input.split('\n');
  const cleanedLines = [];
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    // Skip if previous line was "CURL" and this line is "====="
    if (skipNext && /^[=:\-]+$/.test(trimmed)) {
      skipNext = false;
      continue;
    }
    
    // Check if this line is "CURL" header
    if (/^CURL$/i.test(trimmed)) {
      skipNext = true;
      continue;
    }
    
    // Also skip single-line patterns like "CURL ====="
    if (/^CURL\s*[=:\-]+$/i.test(trimmed)) {
      continue;
    }
    
    skipNext = false;
    cleanedLines.push(lines[i]);
  }

  return cleanedLines.join('\n').trim();
}
