import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";

import { createLinkedAbortController } from "../../src/utils/abort.js";

test("createLinkedAbortController removes parent abort listeners during cleanup", () => {
  const parent = new AbortController();

  for (let index = 0; index < 12; index += 1) {
    const linked = createLinkedAbortController(parent.signal);
    assert.equal(getEventListeners(parent.signal, "abort").length, 1);

    linked.cleanup();

    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  }
});

test("createLinkedAbortController propagates parent aborts to child signals", () => {
  const parent = new AbortController();
  const linked = createLinkedAbortController(parent.signal);

  parent.abort();

  assert.equal(linked.signal?.aborted, true);
  linked.cleanup();
});
