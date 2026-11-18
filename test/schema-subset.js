/**
 * A local copy of the Harness rule for tool schemas (dsh-tools
 * assertSupportedJsonSchema, 0.2.x): only these keywords, required as an
 * array naming declared properties, boolean additionalProperties, one type.
 * Kept here so the tests run without a Harness install.
 */
const CONSTRAINTS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const']);
const ANNOTATIONS = new Set(['description', 'title', 'default', 'examples']);
const TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

export function assertSupportedJsonSchema(schema) {
  const violations = [];
  const visit = (node, path) => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return violations.push(path + ' must be a schema object');
    for (const key of Object.keys(node)) {
      if (!CONSTRAINTS.has(key) && !ANNOTATIONS.has(key)) violations.push(path + '.' + key + ' is not a supported keyword');
    }
    if ('oneOf' in node) return node.oneOf.forEach((n, i) => visit(n, path + '.oneOf[' + i + ']'));
    if (!('type' in node)) return;
    if (!TYPES.includes(node.type)) return violations.push(path + '.type must be one of ' + TYPES.join('/'));
    if (node.type === 'object') {
      if ('required' in node) {
        if (!Array.isArray(node.required)) violations.push(path + '.required must be an array of strings');
        else for (const k of node.required) if (!node.properties || !(k in node.properties)) violations.push(path + '.required names "' + k + '" which is not in properties');
      }
      if ('additionalProperties' in node && typeof node.additionalProperties !== 'boolean') violations.push(path + '.additionalProperties must be a boolean');
      for (const [k, v] of Object.entries(node.properties ?? {})) visit(v, path + '.properties.' + k);
    } else {
      for (const k of ['properties', 'required', 'additionalProperties']) if (k in node) violations.push(path + '.' + k + ' is not supported on type "' + node.type + '"');
    }
    if (node.type === 'array' && 'items' in node) visit(node.items, path + '.items');
  };
  visit(schema, 'schema');
  if (violations.length) throw new Error('unsupported JSON schema: ' + violations.join('; '));
}
