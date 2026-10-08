import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePdf, MAX_PDF_BYTES, PDF_BUCKET } from '../src/lib/attachments.js';
import { createApi } from '../src/lib/api.js';

const pdf = () => new File(['%PDF-1.7\nfixture'], 'guía.pdf', { type: 'application/pdf' });
const task = {
  title: 'Guía de ejercicios',
  frequency: 'daily',
  task_type: 'general',
  start_date: '2026-10-01',
};

test('PDF: validates size, extension, MIME and signature', async () => {
  assert.equal(await validatePdf(pdf()), '');
  assert.match(
    await validatePdf(new File(['text'], 'guia.pdf', { type: 'application/pdf' })),
    /válido/,
  );
  assert.match(await validatePdf(new File(['%PDF-1.7'], 'guia.html')), /Selecciona/);
  assert.match(
    await validatePdf(new File(['%PDF-1.7'], 'guia.pdf', { type: 'text/html' })),
    /Selecciona/,
  );
  assert.match(await validatePdf(new File([], 'guia.pdf')), /10 MB/);
  assert.match(
    await validatePdf({ name: 'large.pdf', type: 'application/pdf', size: MAX_PDF_BYTES + 1 }),
    /10 MB/,
  );
});

function mockClient({ uploadError, insertError } = {}) {
  const calls = [];
  const storage = {
    upload: async (path, file, options) => {
      calls.push(['upload', path, file, options]);
      return { error: uploadError };
    },
    remove: async (paths) => {
      calls.push(['remove', paths]);
      return {};
    },
    createSignedUrl: async (path, seconds) => {
      calls.push(['sign', path, seconds]);
      return { data: { signedUrl: 'https://example.test/pdf' } };
    },
  };
  const client = {
    storage: {
      from: (bucket) => {
        assert.equal(bucket, PDF_BUCKET);
        return storage;
      },
    },
    from: (table) => {
      assert.equal(table, 'tasks');
      return {
        insert: (row) => {
          calls.push(['insert', row]);
          return { select: () => ({ single: async () => ({ data: row, error: insertError }) }) };
        },
      };
    },
  };
  return { calls, api: createApi(false, client) };
}
test('PDF: upload precedes save, and reading requests a short-lived private URL', async () => {
  const { calls, api } = mockClient();
  const saved = await api.addTask('doctor', 'patient', task, pdf());
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['upload', 'insert'],
  );
  assert.equal(saved.attachment_path, `doctor/patient/${saved.id}.pdf`);
  assert.equal(saved.attachment_name, 'guía.pdf');
  assert.equal(await api.taskPdf(saved), 'https://example.test/pdf');
  assert.equal(calls.at(-1)[2], 300);
});
test('PDF: upload failure does not create an activity; insert failure cleans up the upload', async () => {
  const failedUpload = mockClient({ uploadError: new Error('upload failed') });
  await assert.rejects(failedUpload.api.addTask('d', 'p', task, pdf()), /upload failed/);
  assert.deepEqual(
    failedUpload.calls.map((c) => c[0]),
    ['upload'],
  );
  const failedInsert = mockClient({ insertError: new Error('insert failed') });
  await assert.rejects(failedInsert.api.addTask('d', 'p', task, pdf()), /insert failed/);
  assert.deepEqual(
    failedInsert.calls.map((c) => c[0]),
    ['upload', 'insert', 'remove'],
  );
});
test('PDF: existing activities without an attachment still save without storage', async () => {
  const { calls, api } = mockClient();
  await api.addTask('d', 'p', task);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['insert'],
  );
  await assert.rejects(api.taskPdf({}), /no tiene/);
});
