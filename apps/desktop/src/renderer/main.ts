/**
 * Renderer entry point — creates the workbench UI.
 */
import type { IIPCRenderer } from '@gho-work/platform';
import { Workbench } from '@gho-work/ui';
import './styles.css';

// Declare the IPC bridge exposed by preload
declare global {
  interface Window {
    ghoWorkIPC: IIPCRenderer;
  }
}

// Create IPC adapter from the preload-exposed bridge
const ipc: IIPCRenderer = window.ghoWorkIPC;

// Create and render the workbench
const appEl = document.getElementById('app');
if (appEl) {
  const workbench = new Workbench(appEl, ipc);
  workbench.render();
}
