# FAUST Project Structure Design

## Goal
Enable AI-powered book generation from outline while supporting manual editing.

## Data Structure

```javascript
{
  // Project metadata
  title: "My Novel",
  author: "Author Name",
  genre: "psychological_thriller",
  language: "fi",
  created: "2025-10-21T12:00:00Z",
  modified: "2025-10-21T14:30:00Z",

  // Content structure (hierarchical)
  structure: [
    {
      id: "part-1",
      type: "part",              // part | chapter | section
      title: "Osa I: Alku",
      order: 0,
      children: [
        {
          id: "chapter-1",
          type: "chapter",
          title: "Luku 1: Herätys",
          order: 0,
          content: "Lorem ipsum...",
          wordCount: 2540,

          // AI generation metadata
          generatedFrom: "outline-item-1",
          promptUsed: "Write opening chapter introducing protagonist...",
          model: "claude-sonnet-4-5",
          generatedAt: "2025-10-21T13:00:00Z",
          edited: false,          // Has user edited after generation?

          // Continuity tracking
          characters: ["maria", "jussi"],
          locations: ["helsinki-apartment"],
          events: ["maria-wakes-up", "receives-letter"],
          timeframe: "2025-01-15 07:00"
        }
      ]
    }
  ],

  // Outline (source for AI generation)
  outline: [
    {
      id: "outline-item-1",
      title: "Opening - Maria's ordinary life",
      description: "Introduce protagonist, establish normal world, hint at mystery",
      targetWordCount: 2500,
      generatedChapterId: "chapter-1",  // Link to generated content
      status: "generated"                // draft | generating | generated | edited
    },
    {
      id: "outline-item-2",
      title: "Discovery - The letter",
      description: "Maria finds mysterious letter, decision to investigate",
      targetWordCount: 3000,
      status: "draft"
    }
  ],

  // Knowledge base (for continuity)
  characters: [
    {
      id: "maria",
      name: "Maria Virtanen",
      role: "protagonist",
      description: "35-year-old journalist, divorced, lives in Helsinki",
      traits: ["curious", "stubborn", "empathetic"],
      arc: "From passive observer to active seeker of truth",
      firstAppearance: "chapter-1"
    }
  ],

  locations: [
    {
      id: "helsinki-apartment",
      name: "Maria's Apartment",
      description: "Small one-bedroom in Kallio, minimalist, lots of books",
      firstAppearance: "chapter-1"
    }
  ],

  timeline: [
    {
      id: "event-1",
      date: "2025-01-15",
      event: "Maria wakes up and finds the letter",
      chapterId: "chapter-1"
    }
  ],

  // Writing goals
  targets: {
    totalWords: 80000,
    dailyWords: 1000,
    currentTotal: 2540
  },

  // AI settings
  ai: {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    temperature: 0.7,
    maxTokens: 4096,
    batchGeneration: true,
    costTracking: {
      totalSpent: 2.45,
      estimatedRemaining: 15.30
    }
  }
}
```

## File Format

Save as `.faust` file (JSON):
```
my-novel.faust
```

## Key Features

1. **Hierarchical Structure**: Parts → Chapters → Sections
2. **Bidirectional Outline Links**: Outline items link to generated chapters
3. **AI Generation Metadata**: Track what was AI-generated vs manually written
4. **Continuity Tracking**: Characters, locations, events linked to chapters
5. **Version Control**: Track when content was generated/edited
6. **Cost Tracking**: Monitor AI API costs
7. **Batch Generation**: Generate multiple chapters from outline

## Workflow

### AI-Powered Generation
1. User creates outline (list of chapter ideas)
2. Click "Generate Book" button
3. BatchProcessor generates all chapters sequentially
4. User reviews and edits generated content
5. Autosave preserves all changes

### Manual Writing
1. User creates chapters manually
2. Writes content in editor
3. Autosave preserves work
4. Can use AI "Continue" for individual chapters

## Implementation Priority

1. ✅ Project data structure (this document)
2. ⏳ Save/Load IPC (electron.js + app-simple.js)
3. ⏳ File tree component (show parts/chapters/sections)
4. ⏳ Outline panel (create outline items)
5. ⏳ Restore AI modules (BatchProcessor, CostOptimizer)
6. ⏳ "Generate Book" button (batch generation)
7. ⏳ Autosave (every 30 seconds)
