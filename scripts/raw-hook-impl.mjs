/**
 * Node loader hooks: map Vite's `?raw` asset imports to file reads so the
 * real DimensionContent module can execute under Node in tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('?raw')) {
        const filePath = specifier.slice(0, -4);
        const parentDir = context.parentURL
            ? path.dirname(fileURLToPath(context.parentURL))
            : process.cwd();
        const abs = path.resolve(parentDir, filePath);
        return { url: pathToFileURL(abs).href + '?raw', shortCircuit: true };
    }
    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (url.endsWith('?raw')) {
        const abs = fileURLToPath(url.slice(0, -4));
        const source = fs.readFileSync(abs, 'utf8');
        return {
            format: 'module',
            shortCircuit: true,
            source: `export default ${JSON.stringify(source)};`,
        };
    }
    return nextLoad(url, context);
}
