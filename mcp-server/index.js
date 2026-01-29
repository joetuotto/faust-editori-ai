#!/usr/bin/env node
/**
 * FAUST MCP Server
 * Model Context Protocol server for Claude Desktop integration
 *
 * This server allows Claude to interact with FAUST projects:
 * - Read project structure and content
 * - Write and update chapters
 * - Access character information
 * - Analyze story continuity
 *
 * Usage with Claude Desktop:
 * Add to ~/Library/Application Support/Claude/claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "faust": {
 *       "command": "node",
 *       "args": ["/path/to/faust/mcp-server/index.js"]
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

// Project storage path
const FAUST_DATA_DIR = join(homedir(), '.faust-projects');

// Current project state (in-memory)
let currentProject = null;
let currentProjectPath = null;

/**
 * Load project from file
 */
async function loadProject(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    currentProject = JSON.parse(data);
    currentProjectPath = filePath;
    return { success: true, project: currentProject };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Save project to file
 */
async function saveProject() {
  if (!currentProject || !currentProjectPath) {
    return { success: false, error: 'No project loaded' };
  }
  try {
    await fs.writeFile(currentProjectPath, JSON.stringify(currentProject, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List available projects in FAUST data directory
 */
async function listProjects() {
  try {
    // Check multiple possible locations
    const locations = [
      FAUST_DATA_DIR,
      join(homedir(), 'Documents', 'FAUST'),
      join(homedir(), 'Documents'),
    ];

    const projects = [];

    for (const dir of locations) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (file.endsWith('.faust') || file.endsWith('.faust.json')) {
            const filePath = join(dir, file);
            try {
              const stat = await fs.stat(filePath);
              if (stat.isFile()) {
                projects.push({
                  name: file.replace(/\.faust(\.json)?$/, ''),
                  path: filePath,
                  modified: stat.mtime.toISOString(),
                });
              }
            } catch {}
          }
        }
      } catch {}
    }

    return projects;
  } catch (error) {
    return [];
  }
}

// Create server instance
const server = new Server(
  {
    name: 'faust-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all available FAUST projects',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'load_project',
    description: 'Load a FAUST project by file path',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Full path to the .faust or .faust.json file',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_project_info',
    description: 'Get information about the currently loaded project',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_chapters',
    description: 'Get list of chapters in the current project',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_chapter_content',
    description: 'Get the content of a specific chapter',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: {
          type: 'string',
          description: 'The ID of the chapter to read',
        },
        chapterIndex: {
          type: 'number',
          description: 'Alternatively, the index (0-based) of the chapter',
        },
      },
    },
  },
  {
    name: 'write_chapter',
    description: 'Write or update content in a chapter',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: {
          type: 'string',
          description: 'The ID of the chapter to update',
        },
        chapterIndex: {
          type: 'number',
          description: 'Alternatively, the index (0-based) of the chapter',
        },
        content: {
          type: 'string',
          description: 'The new content for the chapter',
        },
        mode: {
          type: 'string',
          enum: ['replace', 'append', 'prepend'],
          description: 'How to apply the content (default: replace)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_characters',
    description: 'Get list of characters in the current project',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: {
          type: 'boolean',
          description: 'Include full character details',
        },
      },
    },
  },
  {
    name: 'get_locations',
    description: 'Get list of locations in the current project',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'analyze_continuity',
    description: 'Analyze story continuity and find potential issues',
    inputSchema: {
      type: 'object',
      properties: {
        startChapter: {
          type: 'number',
          description: 'Starting chapter index for analysis',
        },
        endChapter: {
          type: 'number',
          description: 'Ending chapter index for analysis',
        },
      },
    },
  },
  {
    name: 'create_chapter',
    description: 'Create a new chapter in the project',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the new chapter',
        },
        synopsis: {
          type: 'string',
          description: 'Synopsis/summary of the chapter',
        },
        content: {
          type: 'string',
          description: 'Initial content (optional)',
        },
        afterChapter: {
          type: 'number',
          description: 'Insert after this chapter index (default: end)',
        },
      },
      required: ['title'],
    },
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_projects': {
        const projects = await listProjects();
        return {
          content: [
            {
              type: 'text',
              text: projects.length > 0
                ? `Found ${projects.length} project(s):\n${projects.map(p => `- ${p.name} (${p.path})`).join('\n')}`
                : 'No FAUST projects found. Projects should be saved with .faust or .faust.json extension.',
            },
          ],
        };
      }

      case 'load_project': {
        const result = await loadProject(args.path);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Project loaded: ${currentProject.title || 'Untitled'}\n` +
                  `Chapters: ${currentProject.structure?.length || 0}\n` +
                  `Characters: ${currentProject.characters?.length || 0}\n` +
                  `Words: ${currentProject.targets?.currentTotal || 0}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: 'text', text: `Error loading project: ${result.error}` }],
            isError: true,
          };
        }
      }

      case 'get_project_info': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded. Use load_project first.' }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                title: currentProject.title,
                genre: currentProject.genre,
                theme: currentProject.theme,
                chapters: currentProject.structure?.length || 0,
                characters: currentProject.characters?.length || 0,
                locations: currentProject.locations?.length || 0,
                wordCount: currentProject.targets?.currentTotal || 0,
                targetWords: currentProject.targets?.totalWords || 80000,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_chapters': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded.' }],
            isError: true,
          };
        }
        const chapters = (currentProject.structure || []).map((ch, i) => ({
          index: i,
          id: ch.id,
          title: ch.title,
          synopsis: ch.synopsis,
          wordCount: ch.content?.split(/\s+/).length || 0,
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify(chapters, null, 2) }],
        };
      }

      case 'get_chapter_content': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded.' }],
            isError: true,
          };
        }
        let chapter;
        if (args.chapterId) {
          chapter = currentProject.structure?.find(ch => ch.id === args.chapterId);
        } else if (typeof args.chapterIndex === 'number') {
          chapter = currentProject.structure?.[args.chapterIndex];
        }
        if (!chapter) {
          return {
            content: [{ type: 'text', text: 'Chapter not found.' }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `# ${chapter.title}\n\n${chapter.synopsis ? `*${chapter.synopsis}*\n\n` : ''}${chapter.content || '(Empty)'}`,
            },
          ],
        };
      }

      case 'write_chapter': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded.' }],
            isError: true,
          };
        }
        let chapterIndex;
        if (args.chapterId) {
          chapterIndex = currentProject.structure?.findIndex(ch => ch.id === args.chapterId);
        } else if (typeof args.chapterIndex === 'number') {
          chapterIndex = args.chapterIndex;
        }
        if (chapterIndex === undefined || chapterIndex < 0 || chapterIndex >= currentProject.structure?.length) {
          return {
            content: [{ type: 'text', text: 'Chapter not found.' }],
            isError: true,
          };
        }

        const chapter = currentProject.structure[chapterIndex];
        const mode = args.mode || 'replace';

        switch (mode) {
          case 'append':
            chapter.content = (chapter.content || '') + args.content;
            break;
          case 'prepend':
            chapter.content = args.content + (chapter.content || '');
            break;
          default:
            chapter.content = args.content;
        }

        chapter.modified = new Date().toISOString();

        // Update word count
        const wordCount = chapter.content.split(/\s+/).filter(w => w).length;

        // Save project
        const saveResult = await saveProject();
        if (!saveResult.success) {
          return {
            content: [{ type: 'text', text: `Warning: Content updated but save failed: ${saveResult.error}` }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Chapter "${chapter.title}" updated (${mode}). Word count: ${wordCount}`,
            },
          ],
        };
      }

      case 'get_characters': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded.' }],
            isError: true,
          };
        }
        const characters = (currentProject.characters || []).map(c => {
          if (args.detailed) {
            return c;
          }
          return {
            id: c.id,
            name: c.basicInfo?.name || c.name,
            role: c.basicInfo?.role,
            age: c.basicInfo?.age,
            traits: c.basicInfo?.traits?.slice(0, 3),
          };
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(characters, null, 2) }],
        };
      }

      case 'get_locations': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded.' }],
            isError: true,
          };
        }
        const locations = (currentProject.locations || []).map(l => ({
          id: l.id,
          name: l.name,
          type: l.type,
          description: l.description?.substring(0, 100),
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify(locations, null, 2) }],
        };
      }

      case 'analyze_continuity': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded.' }],
            isError: true,
          };
        }

        const start = args.startChapter || 0;
        const end = args.endChapter || (currentProject.structure?.length - 1) || 0;
        const chapters = currentProject.structure?.slice(start, end + 1) || [];

        // Simple continuity analysis
        const characterMentions = {};
        const locationMentions = {};
        const issues = [];

        chapters.forEach((ch, i) => {
          const content = ch.content || '';
          const chapterNum = start + i + 1;

          // Track character mentions
          (currentProject.characters || []).forEach(c => {
            const name = c.basicInfo?.name || c.name;
            if (name && content.includes(name)) {
              if (!characterMentions[name]) characterMentions[name] = [];
              characterMentions[name].push(chapterNum);
            }
          });

          // Track location mentions
          (currentProject.locations || []).forEach(l => {
            if (l.name && content.includes(l.name)) {
              if (!locationMentions[l.name]) locationMentions[l.name] = [];
              locationMentions[l.name].push(chapterNum);
            }
          });
        });

        // Check for characters who disappear
        Object.entries(characterMentions).forEach(([name, chapters]) => {
          if (chapters.length === 1) {
            issues.push(`Character "${name}" only appears in chapter ${chapters[0]}`);
          }
        });

        return {
          content: [
            {
              type: 'text',
              text: `Continuity Analysis (Chapters ${start + 1}-${end + 1}):\n\n` +
                `Character appearances:\n${Object.entries(characterMentions).map(([n, ch]) => `- ${n}: chapters ${ch.join(', ')}`).join('\n')}\n\n` +
                `Location mentions:\n${Object.entries(locationMentions).map(([n, ch]) => `- ${n}: chapters ${ch.join(', ')}`).join('\n')}\n\n` +
                `Potential issues:\n${issues.length > 0 ? issues.map(i => `- ${i}`).join('\n') : '- None detected'}`,
            },
          ],
        };
      }

      case 'create_chapter': {
        if (!currentProject) {
          return {
            content: [{ type: 'text', text: 'No project loaded.' }],
            isError: true,
          };
        }

        if (!currentProject.structure) {
          currentProject.structure = [];
        }

        const newChapter = {
          id: `chapter-${Date.now()}`,
          title: args.title,
          synopsis: args.synopsis || '',
          content: args.content || '',
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
        };

        const insertIndex = typeof args.afterChapter === 'number'
          ? args.afterChapter + 1
          : currentProject.structure.length;

        currentProject.structure.splice(insertIndex, 0, newChapter);

        // Reorder chapters
        currentProject.structure.forEach((ch, i) => {
          ch.order = i;
        });

        const saveResult = await saveProject();

        return {
          content: [
            {
              type: 'text',
              text: `Chapter "${args.title}" created at position ${insertIndex + 1}.` +
                (saveResult.success ? '' : ` Warning: ${saveResult.error}`),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Handle list resources request
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [];

  if (currentProject) {
    resources.push({
      uri: 'faust://project/current',
      name: currentProject.title || 'Current Project',
      description: 'Currently loaded FAUST project',
      mimeType: 'application/json',
    });

    (currentProject.structure || []).forEach((ch, i) => {
      resources.push({
        uri: `faust://chapter/${ch.id || i}`,
        name: ch.title || `Chapter ${i + 1}`,
        description: ch.synopsis || '',
        mimeType: 'text/plain',
      });
    });
  }

  return { resources };
});

// Handle read resource request
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'faust://project/current') {
    if (!currentProject) {
      throw new Error('No project loaded');
    }
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(currentProject, null, 2),
        },
      ],
    };
  }

  if (uri.startsWith('faust://chapter/')) {
    if (!currentProject) {
      throw new Error('No project loaded');
    }
    const chapterId = uri.replace('faust://chapter/', '');
    const chapter = currentProject.structure?.find(ch => ch.id === chapterId) ||
      currentProject.structure?.[parseInt(chapterId)];
    if (!chapter) {
      throw new Error('Chapter not found');
    }
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: chapter.content || '',
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[FAUST MCP] Server started');
}

main().catch((error) => {
  console.error('[FAUST MCP] Error:', error);
  process.exit(1);
});
