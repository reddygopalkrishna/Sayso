import { z } from 'zod';
import { AppMessageSchema, HelperMessageSchema, PROTOCOL_VERSION } from './messages.ts';

/** JSON Schema for both directions; written to schema/messages.schema.json by `pnpm gen:schema`. */
export function buildSchemaDocument(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `Sayso helper protocol v${PROTOCOL_VERSION}`,
    $defs: {
      AppMessage: z.toJSONSchema(AppMessageSchema),
      HelperMessage: z.toJSONSchema(HelperMessageSchema),
    },
  };
}
