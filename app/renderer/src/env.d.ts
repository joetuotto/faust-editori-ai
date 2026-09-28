/// <reference types="vite/client" />
import type { FaustAPI } from '../../shared/api';

declare global {
  interface Window {
    faust: FaustAPI;
  }
}

export {};
