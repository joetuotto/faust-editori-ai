/**
 * CostOptimizer - Track API costs and usage
 *
 * Features:
 * - Track tokens used per provider
 * - Estimate costs based on pricing
 * - Track request counts
 * - Warn when approaching budget limits
 */

class CostOptimizer {
  constructor(project) {
    this.project = project;

    // Ensure AI structure exists
    if (!this.project.ai) {
      this.project.ai = {};
    }

    // Ensure cost tracking structure exists
    if (!this.project.ai.costTracking) {
      this.project.ai.costTracking = {
        requestCount: 0,
        tokensUsed: 0,
        totalSpent: 0,
        byProvider: {},
        history: []
      };
    }

    // Ensure byProvider object exists
    if (!this.project.ai.costTracking.byProvider) {
      this.project.ai.costTracking.byProvider = {};
    }
  }

  /**
   * Pricing per 1M tokens (as of 2025-01)
   * Input / Output pricing
   */
  static PRICING = {
    anthropic: {
      'claude-sonnet-4-5': { input: 3.00, output: 15.00 }, // Claude 4.5 Sonnet
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
    },
    openai: {
      'gpt-4-turbo-preview': { input: 10.00, output: 30.00 },
      'gpt-4': { input: 30.00, output: 60.00 },
      'gpt-4o': { input: 5.00, output: 15.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
    },
    grok: {
      'grok-2-1212': { input: 2.00, output: 10.00 },
      'grok-beta': { input: 5.00, output: 15.00 }
    },
    deepseek: {
      'deepseek-chat': { input: 0.14, output: 0.28 },
      'deepseek-coder': { input: 0.14, output: 0.28 }
    }
  };

  /**
   * Estimate tokens from text (rough approximation: 1 token ≈ 4 chars)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Track a request
   * @param {String} provider - anthropic/openai/grok/deepseek
   * @param {String} model - Model name
   * @param {String} inputText - Prompt text
   * @param {String} outputText - Response text
   */
  trackRequest(provider, model, inputText, outputText) {
    try {
      // Validate inputs
      if (!provider || !model) {
        console.warn('[CostOptimizer] Invalid provider or model:', { provider, model });
        return {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cost: 0,
          runningTotal: 0
        };
      }

      // Ensure project and AI structure exists
      if (!this.project) {
        console.warn('[CostOptimizer] No project available');
        return {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cost: 0,
          runningTotal: 0
        };
      }

      if (!this.project.ai) {
        this.project.ai = {};
      }

      const inputTokens = this.estimateTokens(inputText || '');
      const outputTokens = this.estimateTokens(outputText || '');
      const totalTokens = inputTokens + outputTokens;

      // Calculate cost
      const cost = this.calculateCost(provider, model, inputTokens, outputTokens);

      // Ensure costTracking structure is still valid
      if (!this.project.ai.costTracking) {
        this.project.ai.costTracking = {
          requestCount: 0,
          tokensUsed: 0,
          totalSpent: 0,
          byProvider: {},
          history: []
        };
      }

      // Update totals
      this.project.ai.costTracking.requestCount++;
      this.project.ai.costTracking.tokensUsed += totalTokens;
      this.project.ai.costTracking.totalSpent += cost;

      // Ensure byProvider exists
      if (!this.project.ai.costTracking.byProvider) {
        this.project.ai.costTracking.byProvider = {};
      }

      // Update per-provider stats
      if (!this.project.ai.costTracking.byProvider[provider]) {
        this.project.ai.costTracking.byProvider[provider] = {
          requests: 0,
          tokens: 0,
          cost: 0
        };
      }

      this.project.ai.costTracking.byProvider[provider].requests++;
      this.project.ai.costTracking.byProvider[provider].tokens += totalTokens;
      this.project.ai.costTracking.byProvider[provider].cost += cost;

      // Add to history
      if (!this.project.ai.costTracking.history) {
        this.project.ai.costTracking.history = [];
      }
      this.project.ai.costTracking.history.push({
        timestamp: new Date().toISOString(),
        provider,
        model,
        inputTokens,
        outputTokens,
        cost
      });

      // Keep only last 100 requests in history
      if (this.project.ai.costTracking.history.length > 100) {
        this.project.ai.costTracking.history = this.project.ai.costTracking.history.slice(-100);
      }

      console.log(`[CostOptimizer] Request tracked: ${provider}/${model}, ${totalTokens} tokens, $${cost.toFixed(4)}`);

      return {
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        runningTotal: this.project.ai.costTracking.totalSpent
      };
    } catch (error) {
      console.error('[CostOptimizer] Tracking failed:', error);
      // Return default values on error
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        runningTotal: 0
      };
    }
  }

  /**
   * Calculate cost for a request
   */
  calculateCost(provider, model, inputTokens, outputTokens) {
    const pricing = CostOptimizer.PRICING[provider]?.[model];

    if (!pricing) {
      console.warn(`[CostOptimizer] No pricing data for ${provider}/${model}, using estimate`);
      // Fallback: average pricing
      return ((inputTokens * 5.00) + (outputTokens * 15.00)) / 1000000;
    }

    const inputCost = (inputTokens * pricing.input) / 1000000;
    const outputCost = (outputTokens * pricing.output) / 1000000;

    return inputCost + outputCost;
  }

  /**
   * Get current spending stats
   */
  getStats() {
    return {
      totalRequests: this.project.ai.costTracking.requestCount,
      totalTokens: this.project.ai.costTracking.tokensUsed,
      totalSpent: this.project.ai.costTracking.totalSpent,
      byProvider: this.project.ai.costTracking.byProvider,
      averageCostPerRequest: this.project.ai.costTracking.requestCount > 0
        ? this.project.ai.costTracking.totalSpent / this.project.ai.costTracking.requestCount
        : 0
    };
  }

  /**
   * Estimate cost for generating N chapters
   */
  estimateGenerationCost(numChapters, wordsPerChapter = 2500) {
    const provider = this.project.ai.provider || 'anthropic';
    const model = this.project.ai.models?.[provider] || 'claude-3-5-sonnet-20241022';

    // Rough estimate: 2500 words ≈ 3300 tokens output
    // Context (previous chapters + prompt) ≈ 2000 tokens input
    const inputTokensPerChapter = 2000;
    const outputTokensPerChapter = Math.ceil(wordsPerChapter * 1.32); // 1 word ≈ 1.32 tokens

    const totalInputTokens = numChapters * inputTokensPerChapter;
    const totalOutputTokens = numChapters * outputTokensPerChapter;

    const estimatedCost = this.calculateCost(provider, model, totalInputTokens, totalOutputTokens);

    return {
      provider,
      model,
      chapters: numChapters,
      wordsPerChapter,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCost,
      costPerChapter: estimatedCost / numChapters
    };
  }

  /**
   * Check if budget limit is approaching
   */
  checkBudget(budgetLimit) {
    const spent = this.project.ai.costTracking.totalSpent;
    const percentUsed = (spent / budgetLimit) * 100;

    if (percentUsed >= 90) {
      return {
        status: 'critical',
        message: `⚠️ Budget critical: $${spent.toFixed(2)} / $${budgetLimit.toFixed(2)} (${percentUsed.toFixed(0)}%)`,
        percentUsed
      };
    } else if (percentUsed >= 75) {
      return {
        status: 'warning',
        message: `⚠️ Budget warning: $${spent.toFixed(2)} / $${budgetLimit.toFixed(2)} (${percentUsed.toFixed(0)}%)`,
        percentUsed
      };
    } else {
      return {
        status: 'ok',
        message: `Budget OK: $${spent.toFixed(2)} / $${budgetLimit.toFixed(2)} (${percentUsed.toFixed(0)}%)`,
        percentUsed
      };
    }
  }

  /**
   * Reset cost tracking
   */
  reset() {
    this.project.ai.costTracking = {
      requestCount: 0,
      tokensUsed: 0,
      totalSpent: 0,
      byProvider: {},
      history: []
    };
  }
}

// Export for use in app.js (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CostOptimizer;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.CostOptimizer = CostOptimizer;
}
