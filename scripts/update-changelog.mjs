import {writeFile} from 'node:fs/promises';
import {readReleases,changelog} from './release-notes.mjs';
await writeFile('CHANGELOG.md',changelog(await readReleases()));
console.log('CHANGELOG.md updated from dist/updates.json');
