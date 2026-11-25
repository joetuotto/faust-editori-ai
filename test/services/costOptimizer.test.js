// Tekoälyn kustannukset (src/services/ai/CostOptimizer.js, a script-tag file that defines a window
// global; jsdom, the default environment, loads it as it is). Final polish round 2: a request of the
// old AI path is counted under the model it really used, also when that model has no price. Before,
// a Cherry Studio model reached the counter as an empty model name and nothing was counted at all.
const path = require('path');

describe('CostOptimizer counts every answered request (final polish round 2)', () => {
  let CostOptimizer;
  let warn;
  let log;

  beforeAll(() => {
    require(path.join(__dirname, '..', '..', 'src', 'services', 'ai', 'CostOptimizer.js'));
    CostOptimizer = window.CostOptimizer;
  });
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  test('a gateway model without a price adds its request and its tokens, and no invented cost', () => {
    const project = { ai: {} };
    const costs = new CostOptimizer(project);
    const info = costs.trackRequest('cherry', 'c91f:deepseek-v4.1-flash-abliterated', 'x'.repeat(400), 'y'.repeat(200), { input_tokens: 532, output_tokens: 412 });
    expect(info).toMatchObject({ inputTokens: 532, outputTokens: 412, totalTokens: 944, cost: 0, priced: false });
    expect(costs.getStats()).toMatchObject({ totalRequests: 1, totalTokens: 944, totalSpent: 0, unpricedRequests: 1, averageCostPerRequest: 0 });
    expect(project.ai.costTracking.byProvider.cherry).toEqual({ requests: 1, tokens: 944, cost: 0, unpriced: 1 });
    expect(project.ai.costTracking.history[0]).toMatchObject({ provider: 'cherry', model: 'c91f:deepseek-v4.1-flash-abliterated', priced: false, cost: 0 });
    expect(warn).not.toHaveBeenCalled();
  });

  test('without the provider\'s own counts the tokens are estimated from the texts, as before', () => {
    const costs = new CostOptimizer({ ai: {} });
    expect(costs.trackRequest('cherry', 'm', 'x'.repeat(400), 'y'.repeat(200))).toMatchObject({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    // A usage object without numbers is not trusted
    expect(costs.trackRequest('cherry', 'm', 'x'.repeat(40), '', { input_tokens: 'many' })).toMatchObject({ inputTokens: 10, outputTokens: 0 });
  });

  test('a request whose model is not known is still a request (an empty model name counted nothing)', () => {
    const costs = new CostOptimizer({ ai: {} });
    expect(costs.trackRequest('anthropic', '', 'kysymys', 'vastaus')).toMatchObject({ priced: false, cost: 0 });
    expect(costs.trackRequest('anthropic', undefined, 'kysymys', 'vastaus')).toMatchObject({ priced: false });
    expect(costs.getStats()).toMatchObject({ totalRequests: 2, unpricedRequests: 2 });
    // No source at all is the one thing that cannot be booked
    expect(costs.trackRequest('', 'm', 'a', 'b')).toMatchObject({ totalTokens: 0, cost: 0 });
    expect(costs.getStats().totalRequests).toBe(2);
  });

  test('a model with a price keeps its cost, and the average is over the priced requests only', () => {
    const costs = new CostOptimizer({ ai: {} });
    const priced = costs.trackRequest('anthropic', 'claude-sonnet-4-5', '', '', { input_tokens: 1000000, output_tokens: 0 });
    expect(priced).toMatchObject({ priced: true, cost: 3 });
    costs.trackRequest('cherry', 'p:glm-5.3', '', '', { input_tokens: 10, output_tokens: 10 });
    expect(costs.getStats()).toMatchObject({ totalRequests: 2, unpricedRequests: 1, totalSpent: 3, averageCostPerRequest: 3 });
  });

  test('a project counted before this fix (no unpricedRequests) reads as all priced, and reset clears the new count', () => {
    const project = { ai: { costTracking: { requestCount: 4, tokensUsed: 800, totalSpent: 0.2, byProvider: { anthropic: { requests: 4, tokens: 800, cost: 0.2 } }, history: [] } } };
    const costs = new CostOptimizer(project);
    expect(costs.getStats()).toMatchObject({ totalRequests: 4, unpricedRequests: 0, averageCostPerRequest: 0.05 });
    costs.trackRequest('cherry', 'm', 'a', 'b');
    expect(costs.getStats().unpricedRequests).toBe(1);
    costs.reset();
    expect(costs.getStats()).toMatchObject({ totalRequests: 0, unpricedRequests: 0, totalSpent: 0 });
  });

  test('app.js books the request under the settings\' source and model, and only an answered one', () => {
    const app = require('fs').readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
    expect(app).toContain("if (costOptimizerRef.current && !(response && response.success === false)) {");
    expect(app).toMatch(/const usedModel = apiParams\.model\s*\|\| \(source \? \(costSource === 'cherry' \? source\.model : source\.anthropicModel\) : ''\)/);
    expect(app).not.toMatch(/trackRequest\(\s*'anthropic',\s*apiParams\.model/);
  });
});
