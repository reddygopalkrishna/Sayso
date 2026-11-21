import { writeFileSync } from 'node:fs';
import { buildSchemaDocument } from '../src/schema.ts';

const out = new URL('../schema/messages.schema.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(buildSchemaDocument(), null, 2)}\n`);
console.log(`wrote ${out.pathname}`);
