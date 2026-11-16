/// <reference lib="webworker" />
import { runScenario, type ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    runScenario(msg.runId, msg.scenario, (m, transfer) => self.postMessage(m, transfer ?? []));
  }
};
