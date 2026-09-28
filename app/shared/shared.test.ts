import { describe, expect, it } from 'vitest';
import type { TreeNode } from './types';
import { countWords, parseFrontmatter, plainLinesToMarkdown, slugify, stringifyFrontmatter } from './text';
import { findNode, findParentId, insertNode, moveNode, moveSibling, removeNode, updateNode } from './tree';
import { parseBlocks, parseInline } from './markdownLite';
import { DEFAULT_MODELS, resolveModel } from './models';

const node = (id: string, type: TreeNode['type'] = 'chapter', children?: TreeNode[]): TreeNode => ({
  id,
  type,
  title: id,
  file: `manuscript/${id}.md`,
  ...(children ? { children } : {})
});

describe('text', () => {
  it('slugifies Finnish titles', () => {
    expect(slugify('Äidin kylmä yö')).toBe('aidin-kylma-yo');
    expect(slugify('???')).toBe('nimeton');
  });

  it('counts words without Markdown markup', () => {
    expect(countWords('# Otsikko\n\nHän *käveli* **hitaasti** — ja pysähtyi.')).toBe(6);
    expect(countWords('')).toBe(0);
  });

  it('round-trips frontmatter without growing the body', () => {
    const source = stringifyFrontmatter({ id: 'a', title: 'Luku: "1"', status: 'draft', empty: undefined }, 'Teksti.\n');
    const parsed = parseFrontmatter<{ id: string; title: string }>(source);
    expect(parsed.data).toEqual({ id: 'a', title: 'Luku: "1"', status: 'draft' });
    expect(parsed.body).toBe('Teksti.\n');
    const again = parseFrontmatter(stringifyFrontmatter(parsed.data, parsed.body));
    expect(again.body).toBe('Teksti.\n');
  });

  it('converts textarea line breaks to paragraphs', () => {
    expect(plainLinesToMarkdown('Eka rivi\nToka rivi\n\n\nKolmas')).toBe('Eka rivi\n\nToka rivi\n\nKolmas');
  });
});

describe('tree', () => {
  const tree = [node('a', 'chapter', [node('a1', 'scene'), node('a2', 'scene')]), node('b')];

  it('finds nodes and parents', () => {
    expect(findNode(tree, 'a2')?.id).toBe('a2');
    expect(findParentId(tree, 'a2')).toBe('a');
    expect(findParentId(tree, 'b')).toBeNull();
    expect(findParentId(tree, 'x')).toBeUndefined();
  });

  it('inserts after a sibling or at the end', () => {
    const t = insertNode(tree, node('a3', 'scene'), 'a', 'a1');
    expect(findNode(t, 'a')!.children!.map(n => n.id)).toEqual(['a1', 'a3', 'a2']);
    expect(insertNode(tree, node('c'), null).map(n => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('removes a subtree and reports removed nodes', () => {
    const { tree: t, removed } = removeNode(tree, 'a');
    expect(t.map(n => n.id)).toEqual(['b']);
    expect(removed.map(n => n.id)).toEqual(['a', 'a1', 'a2']);
  });

  it('moves among siblings and between parents', () => {
    expect(moveSibling(tree, 'a2', -1)[0].children!.map(n => n.id)).toEqual(['a2', 'a1']);
    expect(moveSibling(tree, 'a', -1)).toBe(tree);
    const moved = moveNode(tree, 'a1', 'b', 0);
    expect(findParentId(moved, 'a1')).toBe('b');
    // Cannot move a node into its own subtree
    expect(moveNode(tree, 'a', 'a1', 0)).toBe(tree);
  });

  it('updates without mutating', () => {
    const t = updateNode(tree, 'a1', { title: 'Uusi' });
    expect(findNode(t, 'a1')!.title).toBe('Uusi');
    expect(findNode(tree, 'a1')!.title).toBe('a1');
  });
});

describe('markdownLite', () => {
  it('parses inline emphasis', () => {
    expect(parseInline('Hän *sanoi* **ei** ja ***lähti***.')).toEqual([
      { text: 'Hän ' },
      { text: 'sanoi', italic: true },
      { text: ' ' },
      { text: 'ei', bold: true },
      { text: ' ja ' },
      { text: 'lähti', bold: true, italic: true },
      { text: '.' }
    ]);
  });

  it('parses blocks and scene breaks', () => {
    const blocks = parseBlocks('# Otsikko\n\nKappale\nsamassa.\n\n* * *\n\n> Lainaus');
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'break', 'quote']);
  });
});

describe('models', () => {
  it('replaces retired models', () => {
    expect(resolveModel('anthropic', 'claude-3-5-sonnet-20241022')).toBe(DEFAULT_MODELS.anthropic);
    expect(resolveModel('anthropic', 'claude-sonnet-5')).toBe('claude-sonnet-5');
  });
});
