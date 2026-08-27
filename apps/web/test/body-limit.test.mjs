import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readBoundedUtf8Body } from '../app/body-limit.ts';

function streamOf(...chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
      controller.close();
    },
  });
}

describe('bounded gateway body reader', () => {
  it('reads valid UTF-8 without trusting Content-Length as the actual size', async () => {
    const body = streamOf([0x68, 0x69], [0xe2, 0x82, 0xac]);
    assert.equal(await readBoundedUtf8Body(body, '1', 5), 'hi€');
  });

  it('stops a chunked or lying body as soon as the byte limit is exceeded', async () => {
    assert.equal(await readBoundedUtf8Body(streamOf([1, 2, 3], [4, 5, 6]), null, 5), undefined);
    assert.equal(await readBoundedUtf8Body(streamOf([1]), '6', 5), undefined);
    assert.equal(await readBoundedUtf8Body(streamOf([1]), '-1', 5), undefined);
  });

  it('rejects malformed UTF-8 instead of decoding replacement characters', async () => {
    assert.equal(await readBoundedUtf8Body(streamOf([0xc3, 0x28]), '2', 8), undefined);
  });
});
