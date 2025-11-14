/**
 * ChapterList Component
 * Displays the list of chapters in the sidebar
 */

import React from 'react';
import ChapterItem from './ChapterItem';
import type { Chapter } from '../../types';

interface ChapterListProps {
  chapters: Chapter[];
  activeChapterId: string;
  onChapterClick: (chapterId: string) => void;
  onMoveChapterUp: (chapterId: string) => void;
  onMoveChapterDown: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
}

export const ChapterList: React.FC<ChapterListProps> = ({
  chapters,
  activeChapterId,
  onChapterClick,
  onMoveChapterUp,
  onMoveChapterDown,
  onDeleteChapter
}) => {
  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginBottom: '16px'
    }
  },
    chapters.map((chapter, idx) =>
      React.createElement(ChapterItem, {
        key: chapter.id,
        chapter: chapter,
        isActive: chapter.id === activeChapterId,
        canMoveUp: idx > 0,
        canMoveDown: idx < chapters.length - 1,
        canDelete: chapters.length > 1,
        onClick: () => onChapterClick(chapter.id),
        onMoveUp: () => onMoveChapterUp(chapter.id),
        onMoveDown: () => onMoveChapterDown(chapter.id),
        onDelete: () => onDeleteChapter(chapter.id)
      })
    )
  );
};

export default ChapterList;
