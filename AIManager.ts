import { Project } from './types'; // Assume types file

interface AIResponse {
  success: boolean;
  data?: string;
  error?: string;
  feedback?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface AIOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export class AIManager {
  private project: Project | null = null;

  constructor(project?: Project) {
    if (project) this.project = project;
  }

  setProject(project: Project) {
    this.project = project;
  }

  async callAI(model: string, prompt: string): Promise<AIResponse> {
    let result;
    switch (model) {
      case 'claude':
        result = await window.electronAPI.claudeAPI(prompt);
        break;
      case 'grok':
        result = await window.electronAPI.grokAPI(prompt);
        break;
      // ... other cases
      default:
        result = await window.electronAPI.claudeAPI(prompt);
    }
    return result || { success: false, error: 'Unknown model' };
  }

  async callAIAPI(prompt: string, includeContext = true): Promise<void> {
    // Extracted logic from app.js
    // ... implementation with try-catch
    try {
      const context = includeContext ? this.gatherContext() : '';
      const fullPrompt = `Olet luova kirjoitusavustaja... ${prompt}${context}`;
      const result = await this.callAI('claude', fullPrompt); // default
      if (result.success) {
        // Set AI response
        console.log('AI Response:', result.data); // Temp, remove later
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('AI API Error:', err);
    }
  }

  gatherContext(): string {
    const activeItem = this.getActiveItem(); // Assume helper
    return JSON.stringify({
      outline: this.project?.story?.outline || '',
      // ... other context
    });
  }

  // AIChainManager logic
  async analyzeWithAIChain(content: string, options: AIOptions = {}): Promise<any> {
    const cacheKey = `ai-chain-${content.length}-${JSON.stringify(options)}`; // Optimized
    // ... implementation with cache and JSON.parse try-catch
    try {
      const result = await this.callAI(options.model || 'deepseek/deepseek-chat', content);
      if (!result.success) {
        return { issues: [], severity: 'low' };
      }
      const parsed = JSON.parse(result.data || '{}');
      return parsed;
    } catch (e) {
      console.error('Parse error:', e);
      return { issues: [], severity: 'low' };
    }
  }

  // Export functions for use
  static create(): AIManager {
    return new AIManager();
  }
}


