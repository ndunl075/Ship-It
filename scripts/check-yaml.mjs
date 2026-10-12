import { readFile, readdir } from 'node:fs/promises';
import { parseDocument } from 'yaml';
async function check(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${file.name}`;
    if (file.isDirectory()) await check(path);
    else if (/\.ya?ml$/.test(file.name)) {
      const doc = parseDocument(await readFile(path, 'utf8'));
      if (doc.errors.length) throw new Error(`${path}: ${doc.errors.join(', ')}`);
      console.log(`Valid YAML: ${path}`);
    }
  }
}
await check('.github');
await check('examples');
const action = parseDocument(await readFile('action.yml', 'utf8'));
if (action.errors.length) throw new Error(action.errors.join(', '));
