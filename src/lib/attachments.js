export const PDF_BUCKET = 'activity-pdfs';
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function validatePdf(file) {
  if (!file || !/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf'))
    return 'Selecciona un archivo PDF.';
  if (file.name.length > 255) return 'El nombre del PDF no puede superar los 255 caracteres.';
  if (!file.size || file.size > MAX_PDF_BYTES) return 'El PDF debe pesar entre 1 byte y 10 MB.';
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (header !== '%PDF-') return 'El archivo no contiene un PDF válido.';
  return '';
}

// Blobs stay outside localStorage so larger demo guides do not exhaust its quota.
export function demoPdf(action, key, file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vitalia-demo-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pdfs');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('pdfs', action === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('pdfs');
      const operation = action === 'put' ? store.put(file, key) : store[action](key);
      transaction.oncomplete = () => {
        db.close();
        resolve(operation.result);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}
