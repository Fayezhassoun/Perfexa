// Minimal zod → JSON Schema converter for tool specs. Supports the subset we
// use for tool definitions; throws on anything exotic so gaps are loud.

import type { ZodTypeAny } from 'zod';

interface ZodDef {
  typeName: string;
  description?: string;
  innerType?: ZodTypeAny;
  type?: ZodTypeAny; // array element
  shape?: () => Record<string, ZodTypeAny>;
  values?: string[];
  checks?: { kind: string; value?: number }[];
  defaultValue?: () => unknown;
}

function def(schema: ZodTypeAny): ZodDef {
  return (schema as unknown as { _def: ZodDef })._def;
}

export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const d = def(schema);
  const base = convert(schema);
  if (d.description) base.description = d.description;
  return base;
}

function convert(schema: ZodTypeAny): Record<string, unknown> {
  const d = def(schema);
  switch (d.typeName) {
    case 'ZodString': {
      const out: Record<string, unknown> = { type: 'string' };
      for (const c of d.checks ?? []) {
        if (c.kind === 'min') out.minLength = c.value;
        if (c.kind === 'max') out.maxLength = c.value;
        if (c.kind === 'email') out.format = 'email';
        if (c.kind === 'url') out.format = 'uri';
      }
      return out;
    }
    case 'ZodNumber': {
      const isInt = (d.checks ?? []).some((c) => c.kind === 'int');
      const out: Record<string, unknown> = { type: isInt ? 'integer' : 'number' };
      for (const c of d.checks ?? []) {
        if (c.kind === 'min') out.minimum = c.value;
        if (c.kind === 'max') out.maximum = c.value;
      }
      return out;
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: d.values ?? [] };
    case 'ZodArray':
      return { type: 'array', items: d.type ? zodToJsonSchema(d.type) : {} };
    case 'ZodObject': {
      const shape = d.shape?.() ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!isOptional(value)) required.push(key);
      }
      return { type: 'object', properties, required };
    }
    case 'ZodOptional':
    case 'ZodNullable':
      return d.innerType ? zodToJsonSchema(d.innerType) : {};
    case 'ZodDefault': {
      const inner = d.innerType ? zodToJsonSchema(d.innerType) : {};
      inner.default = d.defaultValue?.();
      return inner;
    }
    default:
      throw new Error(`zodToJsonSchema: unsupported type ${d.typeName}`);
  }
}

function isOptional(schema: ZodTypeAny): boolean {
  const t = def(schema).typeName;
  return t === 'ZodOptional' || t === 'ZodNullable' || t === 'ZodDefault';
}
