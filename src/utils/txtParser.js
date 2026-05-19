/**
 * Parse a single TXT file content into { curl, responseJson }.
 *
 * Expected format (either of these):
 *
 * Format A — separated by a blank line:
 *   curl -X GET 'https://...' \
 *     -H 'Content-Type: application/json'
 *
 *   { "meta": { "status_code": "00000" } }
 *
 * Format B — CURL: / RESPONSE: markers:
 *   CURL:
 *   curl -X GET 'https://...'
 *   RESPONSE:
 *   { "meta": { ... } }
 *
 * Format C — JSON block starts with { or [ after the curl command
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
    return {
      curl: curlMatch ? curlMatch[1].trim() : '',
      responseJson: responseMatch ? responseMatch[1].trim() : '',
    };
  }

  // Format A / C: find where the JSON block starts
  const lines = text.split('\n');
  let jsonStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // JSON starts with { or [
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && !trimmed.startsWith('curl')) {
      jsonStartIndex = i;
      break;
    }
  }

  if (jsonStartIndex !== -1) {
    const curl = lines.slice(0, jsonStartIndex).join('\n').trim();
    const responseJson = lines.slice(jsonStartIndex).join('\n').trim();
    return { curl, responseJson };
  }

  // Fallback: treat entire content as curl, no response
  return { curl: text, responseJson: '' };
}
