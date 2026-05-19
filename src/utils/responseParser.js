/**
 * Generate Katalon `WebUI.verifyMatch` assertions from a JSON response example.
 *
 * Only validates:
 * - status_code field (typically in meta.status_code)
 * - status_desc or status_description field (typically in meta.status_desc)
 */
export function generateAssertions(responseInput, options = {}) {
  const { rootVar = 'result' } = options;

  let parsed;
  try {
    parsed = typeof responseInput === 'string' ? JSON.parse(responseInput) : responseInput;
  } catch (e) {
    return { assertions: [], error: `Invalid JSON: ${e.message}` };
  }

  const assertions = [];

  // Find status_code and status_desc/status_description in the response tree
  const statusCodePath = findFieldPath(parsed, 'status_code');
  const statusDescPath = findFieldPath(parsed, ['status_desc', 'status_description']);

  if (statusCodePath) {
    const value = getValueAtPath(parsed, statusCodePath);
    const literal = formatGroovyLiteral(value);
    const groovyPath = `${rootVar}${pathToGroovy(statusCodePath)}`;
    assertions.push(`WebUI.verifyMatch(${groovyPath}.toString(), ${literal}, false)`);
  }

  if (statusDescPath) {
    const value = getValueAtPath(parsed, statusDescPath);
    const literal = formatGroovyLiteral(value);
    const groovyPath = `${rootVar}${pathToGroovy(statusDescPath)}`;
    assertions.push(`WebUI.verifyMatch(${groovyPath}.toString(), ${literal}, false)`);
  }

  return { assertions, error: null };
}

/**
 * Find the path to a field in the JSON tree.
 * fieldNames can be a string or array of strings (tries each in order).
 */
function findFieldPath(obj, fieldNames, currentPath = []) {
  if (!obj || typeof obj !== 'object') return null;

  const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];

  // Check current level
  for (const name of names) {
    if (name in obj) {
      return [...currentPath, name];
    }
  }

  // Recurse into nested objects
  for (const key of Object.keys(obj)) {
    const result = findFieldPath(obj[key], fieldNames, [...currentPath, key]);
    if (result) return result;
  }

  return null;
}

/**
 * Get the value at a given path in an object.
 */
function getValueAtPath(obj, path) {
  let current = obj;
  for (const key of path) {
    current = current?.[key];
  }
  return current;
}

/**
 * Convert a path array to Groovy property access syntax.
 */
function pathToGroovy(path) {
  return path.map((key) => {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return `.${key}`;
    }
    return `['${escapeSingle(key)}']`;
  }).join('');
}

function formatGroovyLiteral(value) {
  if (typeof value === 'boolean') return `'${value}'`;
  if (typeof value === 'number') return `'${value}'`;
  return `'${escapeSingle(String(value))}'`;
}

function escapeSingle(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
