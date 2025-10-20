import { render, fireEvent } from '@testing-library/react';
import { StoryProvider, useStory } from '../StoryManager';
import { createDefaultProject } from '../StoryManager';

// Test createDefaultProject
test('createDefaultProject returns valid structure', () => {
  const project = createDefaultProject();
  expect(project.items).toBeDefined();
  expect(project.story).toBeDefined();
  expect(Array.isArray(project.characters)).toBe(true);
});

// Test getActiveItem (mock context)
function TestComponent() {
  const { getActiveItem } = useStory();
  return <div data-testid="active">{getActiveItem()?.title || 'None'}</div>;
}

test('getActiveItem returns correct item', () => {
  const mockProject = { items: [{ id: '1', title: 'Test', content: 'Test' }] };
  render(
    <StoryProvider initialProject={mockProject}>
      <TestComponent />
    </StoryProvider>
  );
  // ... assertions
  expect(screen.getByTestId('active').textContent).toBe('Test');
});

// Test updateEditorContent
test('updateEditorContent updates project state', () => {
  // Mock and test update logic
  // ...
  expect(updateSpy).toHaveBeenCalledWith(expect.any(String));
});


