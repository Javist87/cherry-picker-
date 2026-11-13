// Velger datakilde for klienten. Standard er «local»: frittstående prototype med fiktive data i sessionStorage.
// API-serveren setter <meta name="cp-data-source" content="api"> når den serverer index.html.
// I API-modus ligger ingen saksdata i nettleserlagring.
import { createLocalSource } from './local-source.mjs';
import { createApiSource } from './api-source.mjs';

export function createDataSource(doc = document) {
  const mode = doc.querySelector('meta[name="cp-data-source"]')?.content === 'api' ? 'api' : 'local';
  return mode === 'api' ? createApiSource() : createLocalSource();
}
