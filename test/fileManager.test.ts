// Mock electronAPI
import { FileManager } from '../FileManager';

test('FileManager.saveProject success', async () => {
  const mockProject = { title: 'Test' };
  const manager = FileManager.create();
  window.electronAPI.saveProject = jest.fn().mockResolvedValue({ success: true });
  const result = await manager.saveProject(mockProject);
  expect(result.success).toBe(true);
});

test('FileManager.exportDocument pdf', async () => {
  const manager = FileManager.create();
  window.electronAPI.exportPDF = jest.fn().mockResolvedValue({ success: true });
  const result = await manager.exportDocument('pdf', { title: 'Test', content: 'Test' });
  expect(result.success).toBe(true);
});


