/**
 * Generate Katalon `WebUI.verifyMatch` assertions from a JSON response example.
 *
 * Recursively walks the JSON tree. For each scalar leaf it emits an assertion
 * line referencing the equivalent path on a `result` variable produced by
 * `JsonSlurper.parseText(...)` in Katalon.
 */
export function generateAssertions(responseInput, options = {}) {
  const { rootVar = 'result', maxAssertions = 200 } = options;

  let parsed;
  try {
    parsed = typeof responseInput === 'string' ? JSON.parse(responseInput) : responseInput;
  } catch (e) {
    return { assertions: [], error: `Invalid JSON: ${e.message}` };
  }

  const assertions = [];
  walk(parsed, rootVar, assertions, maxAssertions);
  return { assertions, error: null };
}

function walk(value, path, assertions, max) {
  if (assertions.length >= max) return;
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    if (value.length === 0) return;
    // Use the first element as a representative shape
    walk(value[0], `${path}[0]`, assertions, max);
    return;
  }

  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      walk(value[key], `${path}${formatKey(key)}`, assertions, max);
      if (assertions.length >= max) return;
    }
    return;
  }

  // Scalar leaf: string, number, boolean
  const literal = formatGroovyLiteral(value);
  assertions.push(`WebUI.verifyMatch(${path}.toString(), ${literal}, false)`);
}

function formatKey(key) {
  // Use bracket notation for keys that are not safe Groovy identifiers
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return `.${key}`;
  }
  return `['${escapeSingle(key)}']`;
}

function formatGroovyLiteral(value) {
  if (typeof value === 'boolean') return `'${value}'`;
  if (typeof value === 'number') return `'${value}'`;
  return `'${escapeSingle(String(value))}'`;
}

function escapeSingle(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
