import type { DrawdyWebviewApi } from "@drawdy/driver-protocol";

declare global {
  function acquireDrawdyApi(): DrawdyWebviewApi;
}

export {};
