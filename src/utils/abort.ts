export function createLinkedAbortController(parent?: AbortSignal): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  if (!parent) {
    return {
      signal: undefined,
      cleanup: () => {},
    };
  }

  const controller = new AbortController();

  if (parent.aborted) {
    controller.abort(parent.reason);
    return {
      signal: controller.signal,
      cleanup: () => {},
    };
  }

  const onAbort = (): void => {
    controller.abort(parent.reason);
  };

  parent.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      parent.removeEventListener("abort", onAbort);
    },
  };
}
