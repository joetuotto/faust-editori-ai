// Type definitions for @xenova/transformers (optional package)
// This allows the project to compile even if the package is not installed

declare module '@xenova/transformers' {
  export function pipeline(
    task: string,
    model?: string,
    options?: any
  ): Promise<any>;

  export class AutoTokenizer {
    static from_pretrained(modelName: string): Promise<any>;
  }

  export class AutoModel {
    static from_pretrained(modelName: string): Promise<any>;
  }
}
