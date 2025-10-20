export interface Project {
  id?: string;
  title: string;
  items: Item[];
  story: Story;
  characters: Character[];
  locations: Location[];
  genre: string;
  // ...
}

export interface Item {
  id: string;
  title: string;
  type: 'folder' | 'chapter' | 'scene';
  content?: string;
  children?: Item[];
  // ...
}

export interface Story {
  chapters: Chapter[];
  outline: string[];
  events: Event[];
  threads: Thread[];
  // ...
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  content: string;
  status: 'draft' | 'review' | 'done';
  // ...
}

export interface Character {
  id: string;
  name: string;
  description: string;
  // ...
}

export interface Location {
  id: string;
  name: string;
  description: string;
  // ...
}

// AI types
export interface AIResponse {
  success: boolean;
  data?: string;
  error?: string;
  // ...
}

export interface ActiveItem extends Item {
  // ...
}


