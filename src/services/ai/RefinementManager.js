/**
 * FAUST - Refinement Manager
 * Manages iterative chapter refinement with version history,
 * user feedback, and AI-powered regeneration.
 */
(function(window) {
  'use strict';

  class RefinementManager {
    constructor(project, setProject, callAIWithMode) {
      this.project = project;
      this.setProject = setProject;
      this.callAIWithMode = callAIWithMode;
    }

    /**
     * Initialize a chapter's version history with its current content
     */
    initializeVersionHistory(chapter) {
      if (!chapter.versions || chapter.versions.length === 0) {
        const initialVersion = {
          id: 'v1',
          content: chapter.content || '',
          timestamp: chapter.created || new Date().toISOString(),
          generatedFrom: {
            mode: 'manual',
            prompt: null,
            model: null,
            basedOn: null,
            userFeedback: 'Original draft'
          },
          userRating: null,
          userFeedback: null
        };

        chapter.versions = [initialVersion];
        chapter.currentVersion = 'v1';
      }
    }

    /**
     * Regenerate a chapter based on user feedback
     */
    async regenerateChapter(chapterId, userFeedback, mode = 'production') {
      const chapter = this.findChapter(chapterId);
      if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

      // Initialize version history if needed
      this.initializeVersionHistory(chapter);

      const currentContent = chapter.content;

      // Build refinement prompt
      const prompt = this.buildRefinementPrompt(chapter, currentContent, userFeedback);

      console.log(`[Refinement] Regenerating chapter "${chapter.title}" in ${mode} mode`);

      // Generate new version using AI with specified mode
      const result = await this.callAIWithMode(prompt, {
        temperature: mode === 'exploration' ? 0.9 : mode === 'polish' ? 0.3 : 0.7,
        max_tokens: 4096
      });

      const newContent = typeof result === 'string' ? result : result.content || result.text || '';

      // Create new version entry
      const versionNumber = chapter.versions.length + 1;
      const newVersion = {
        id: `v${versionNumber}`,
        content: newContent,
        timestamp: new Date().toISOString(),
        generatedFrom: {
          mode,
          prompt,
          model: this.project.ai.model,
          basedOn: chapter.currentVersion,
          userFeedback
        },
        userRating: null,
        userFeedback: null
      };

      // Add to version history
      chapter.versions.push(newVersion);
      chapter.currentVersion = newVersion.id;
      chapter.content = newContent;
      chapter.wordCount = newContent.split(/\s+/).filter(w => w.length > 0).length;
      chapter.modified = new Date().toISOString();

      // Update project
      this.updateChapter(chapter);

      console.log(`[Refinement] Created ${newVersion.id} (${chapter.wordCount} words)`);

      return newVersion;
    }

    /**
     * Build the refinement prompt with context
     */
    buildRefinementPrompt(chapter, currentContent, userFeedback) {
      // Gather context
      const characterContext = this.project.characters
        .map(c => `- ${c.name}: ${c.description}`)
        .join('\n');

      const locationContext = this.project.locations
        .map(l => `- ${l.name}: ${l.description}`)
        .join('\n');

      return `Olet uudelleenkirjoittamassa lukua kirjailijan palautteen perusteella.

NYKYINEN VERSIO:
${currentContent}

KIRJAILIJAN PALAUTE:
${userFeedback}

TARINAN KONTEKSTI:
- Teos: ${this.project.title}
- Kirjailija: ${this.project.author || 'Ei määritelty'}
- Genre: ${this.project.genre}
- Luku: ${chapter.title}

${characterContext ? `HAHMOT:\n${characterContext}\n` : ''}
${locationContext ? `PAIKAT:\n${locationContext}\n` : ''}

TEHTÄVÄ:
Kirjoita luku uudelleen ottaen huomioon kirjailijan palaute. Säilytä tarinan johdonmukaisuus ja tyyli. Palauta vain uudelleenkirjoitettu luku ilman metatietoja tai selityksiä.`;
    }

    /**
     * Restore a previous version
     */
    restoreVersion(chapterId, versionId) {
      const chapter = this.findChapter(chapterId);
      if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

      const version = chapter.versions.find(v => v.id === versionId);
      if (!version) throw new Error(`Version ${versionId} not found`);

      chapter.currentVersion = versionId;
      chapter.content = version.content;
      chapter.wordCount = version.content.split(/\s+/).filter(w => w.length > 0).length;
      chapter.modified = new Date().toISOString();

      this.updateChapter(chapter);

      console.log(`[Refinement] Restored to ${versionId} (${chapter.wordCount} words)`);
    }

    /**
     * Rate and provide feedback for a version
     */
    rateVersion(chapterId, versionId, rating, feedback) {
      const chapter = this.findChapter(chapterId);
      if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

      const version = chapter.versions.find(v => v.id === versionId);
      if (!version) throw new Error(`Version ${versionId} not found`);

      version.userRating = rating;
      version.userFeedback = feedback;

      this.updateChapter(chapter);

      console.log(`[Refinement] Rated ${versionId}: ${rating}/5 stars`);
    }

    /**
     * Get version comparison data
     */
    compareVersions(chapterId, versionId1, versionId2) {
      const chapter = this.findChapter(chapterId);
      if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

      const v1 = chapter.versions.find(v => v.id === versionId1);
      const v2 = chapter.versions.find(v => v.id === versionId2);

      if (!v1 || !v2) throw new Error('One or both versions not found');

      return {
        version1: { id: v1.id, content: v1.content, timestamp: v1.timestamp },
        version2: { id: v2.id, content: v2.content, timestamp: v2.timestamp },
        wordCountDiff: v2.content.split(/\s+/).length - v1.content.split(/\s+/).length
      };
    }

    /**
     * Find a chapter by ID
     */
    findChapter(chapterId) {
      const findInStructure = (items) => {
        for (const item of items) {
          if (item.id === chapterId) return item;
          if (item.children && item.children.length > 0) {
            const found = findInStructure(item.children);
            if (found) return found;
          }
        }
        return null;
      };

      return findInStructure(this.project.structure);
    }

    /**
     * Update chapter in project state
     */
    updateChapter(updatedChapter) {
      this.setProject(prevProject => {
        const updateInStructure = (items) => {
          return items.map(item => {
            if (item.id === updatedChapter.id) {
              return { ...updatedChapter };
            }
            if (item.children && item.children.length > 0) {
              return { ...item, children: updateInStructure(item.children) };
            }
            return item;
          });
        };

        return {
          ...prevProject,
          structure: updateInStructure(prevProject.structure),
          modified: new Date().toISOString()
        };
      });
    }
  }

  window.RefinementManager = RefinementManager;
})(window);
