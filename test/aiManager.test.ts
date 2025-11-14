// Similar to above, mock window.electronAPI
import { AIManager } from '../AIManager';

jest.mock('electron', () => ({ /* mocks */ }));

test('AIManager.callAI returns success response', async () => {
  const manager = AIManager.create();
  const result = await manager.callAI('claude', 'test prompt');
  expect(result.success).toBe(true);
});

test('AIManager.gatherContext handles null project', () => {
  const manager = new AIManager(null);
  const context = manager.gatherContext();
  expect(context).toBe(JSON.stringify({ outline: '' }));
});

test('analyzeWithAIChain handles parse error', async () => {
  const manager = AIManager.create();
  // Mock invalid JSON
  const result = await manager.analyzeWithAIChain('invalid', {});
  expect(result.severity).toBe('low');
});

















