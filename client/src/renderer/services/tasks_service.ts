import { v4 as uuidv4 } from 'uuid';

export interface ListItem {
  id: string;
  content: string;
  description: string;
  completed: boolean;
  collapsed: boolean;
  children: ListItem[];
  createdAt: string;
}

export interface TasksState {
  rootItems: ListItem[];
  focusedItemId: string | null;
  showCompleted: boolean;
}

export interface BreadcrumbItem {
  id: string;
  content: string;
}

const STORAGE_KEY = 'geckit-tasks';

const DEFAULT_TASKS_STATE: TasksState = {
  rootItems: [],
  focusedItemId: null,
  showCompleted: true,
};

export function getTasksState(): TasksState {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_TASKS_STATE;

  try {
    return { ...DEFAULT_TASKS_STATE, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_TASKS_STATE;
  }
}

export function setTasksState(state: TasksState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function generateId(): string {
  return uuidv4();
}

export function createItem(content: string = ''): ListItem {
  return {
    id: generateId(),
    content,
    description: '',
    completed: false,
    collapsed: false,
    children: [],
    createdAt: new Date().toISOString(),
  };
}

// Find an item by ID in the tree
export function findItemById(items: ListItem[], id: string): ListItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const found = findItemById(item.children, id);
    if (found) return found;
  }
  return null;
}

// Find the path (array of IDs) from root to an item
export function findItemPath(
  items: ListItem[],
  id: string,
  currentPath: string[] = [],
): string[] | null {
  for (const item of items) {
    if (item.id === id) {
      return [...currentPath, item.id];
    }
    const found = findItemPath(item.children, id, [...currentPath, item.id]);
    if (found) return found;
  }
  return null;
}

// Get breadcrumb items for navigation
export function getBreadcrumbPath(
  items: ListItem[],
  focusedId: string | null,
): BreadcrumbItem[] {
  if (!focusedId) return [];

  const path = findItemPath(items, focusedId);
  if (!path) return [];

  const breadcrumbs: BreadcrumbItem[] = [];
  let currentItems = items;

  for (const id of path) {
    const item = currentItems.find((i) => i.id === id);
    if (item) {
      breadcrumbs.push({ id: item.id, content: item.content });
      currentItems = item.children;
    }
  }

  return breadcrumbs;
}

// Find parent of an item
export function findParent(
  items: ListItem[],
  id: string,
  parent: ListItem | null = null,
): ListItem | null {
  for (const item of items) {
    if (item.id === id) return parent;
    const found = findParent(item.children, id, item);
    if (found !== undefined) return found;
  }
  return null;
}

// Find sibling index
export function findSiblingIndex(items: ListItem[], id: string): number {
  return items.findIndex((item) => item.id === id);
}

// Deep clone items
function cloneItems(items: ListItem[]): ListItem[] {
  return items.map((item) => ({
    ...item,
    children: cloneItems(item.children),
  }));
}

// Update a single item in the tree
export function updateItem(
  items: ListItem[],
  id: string,
  updates: Partial<ListItem>,
): ListItem[] {
  return items.map((item) => {
    if (item.id === id) {
      return { ...item, ...updates };
    }
    return {
      ...item,
      children: updateItem(item.children, id, updates),
    };
  });
}

// Remove an item from the tree
export function removeItem(items: ListItem[], id: string): ListItem[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) => ({
      ...item,
      children: removeItem(item.children, id),
    }));
}

// Insert an item as a child of parentId at given index (or at root if parentId is null)
export function insertItem(
  items: ListItem[],
  parentId: string | null,
  newItem: ListItem,
  index: number = -1,
): ListItem[] {
  if (parentId === null) {
    // Insert at root level
    const newItems = [...items];
    if (index === -1 || index >= items.length) {
      newItems.push(newItem);
    } else {
      newItems.splice(index, 0, newItem);
    }
    return newItems;
  }

  return items.map((item) => {
    if (item.id === parentId) {
      const newChildren = [...item.children];
      if (index === -1 || index >= item.children.length) {
        newChildren.push(newItem);
      } else {
        newChildren.splice(index, 0, newItem);
      }
      return { ...item, children: newChildren };
    }
    return {
      ...item,
      children: insertItem(item.children, parentId, newItem, index),
    };
  });
}

// Insert a sibling after a given item
export function insertSiblingAfter(
  items: ListItem[],
  afterId: string,
  newItem: ListItem,
): ListItem[] {
  const result: ListItem[] = [];

  for (const item of items) {
    result.push({
      ...item,
      children: insertSiblingAfter(item.children, afterId, newItem),
    });
    if (item.id === afterId) {
      result.push(newItem);
    }
  }

  return result;
}

// Move an item to a new parent at a given index
export function moveItem(
  items: ListItem[],
  itemId: string,
  newParentId: string | null,
  newIndex: number,
): ListItem[] {
  // First, find and remove the item
  const item = findItemById(items, itemId);
  if (!item) return items;

  const itemClone = { ...item, children: cloneItems(item.children) };
  let newItems = removeItem(items, itemId);

  // Then insert at new location
  newItems = insertItem(newItems, newParentId, itemClone, newIndex);

  return newItems;
}

// Indent an item (make it a child of the previous sibling)
export function indentItem(
  items: ListItem[],
  id: string,
): { items: ListItem[]; success: boolean } {
  // Find at what level this item exists
  const index = items.findIndex((item) => item.id === id);

  if (index > 0) {
    // Item is at this level, make it child of previous sibling
    const item = items[index];
    const prevSibling = items[index - 1];
    const newItems = items.filter((_, i) => i !== index);
    newItems[index - 1] = {
      ...prevSibling,
      children: [...prevSibling.children, item],
      collapsed: false, // Auto-expand to show the new child
    };
    return { items: newItems, success: true };
  }

  // Try in children
  for (let i = 0; i < items.length; i++) {
    const result = indentItem(items[i].children, id);
    if (result.success) {
      const newItems = [...items];
      newItems[i] = { ...items[i], children: result.items };
      return { items: newItems, success: true };
    }
  }

  return { items, success: false };
}

// Outdent an item (move it to parent's level, after the parent)
export function outdentItem(
  items: ListItem[],
  id: string,
  grandparent: ListItem[] | null = null,
  parent: ListItem | null = null,
): { items: ListItem[]; success: boolean; newItems?: ListItem[] } {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Check if target is a child of this item
    const childIndex = item.children.findIndex((c) => c.id === id);
    if (childIndex !== -1) {
      const targetItem = item.children[childIndex];
      // Remove from current parent's children
      const newChildren = item.children.filter((_, idx) => idx !== childIndex);
      const updatedItem = { ...item, children: newChildren };

      if (grandparent === null) {
        // Parent is at root level, move target to root after parent
        const parentIndex = items.findIndex((it) => it.id === item.id);
        const newItems = [...items];
        newItems[parentIndex] = updatedItem;
        newItems.splice(parentIndex + 1, 0, targetItem);
        return { items: newItems, success: true };
      } else {
        // We're in a nested call - return updated items and signal to insert
        const newItems = items.map((it) =>
          it.id === item.id ? updatedItem : it,
        );
        return { items: newItems, success: true, newItems: [targetItem] };
      }
    }

    // Recurse into children
    const result = outdentItem(item.children, id, items, item);
    if (result.success) {
      let newItems = [...items];
      newItems[i] = { ...item, children: result.items };

      // If there are items to insert after this item
      if (result.newItems) {
        const parentIndex = newItems.findIndex((it) => it.id === item.id);
        newItems.splice(parentIndex + 1, 0, ...result.newItems);
      }

      return { items: newItems, success: true };
    }
  }

  return { items, success: false };
}

// Move an item up within its siblings
export function moveItemUp(
  items: ListItem[],
  id: string,
): { items: ListItem[]; success: boolean } {
  const index = items.findIndex((item) => item.id === id);

  if (index > 0) {
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [
      newItems[index],
      newItems[index - 1],
    ];
    return { items: newItems, success: true };
  }

  // Try in children
  for (let i = 0; i < items.length; i++) {
    const result = moveItemUp(items[i].children, id);
    if (result.success) {
      const newItems = [...items];
      newItems[i] = { ...items[i], children: result.items };
      return { items: newItems, success: true };
    }
  }

  return { items, success: false };
}

// Move an item down within its siblings
export function moveItemDown(
  items: ListItem[],
  id: string,
): { items: ListItem[]; success: boolean } {
  const index = items.findIndex((item) => item.id === id);

  if (index !== -1 && index < items.length - 1) {
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [
      newItems[index + 1],
      newItems[index],
    ];
    return { items: newItems, success: true };
  }

  // Try in children
  for (let i = 0; i < items.length; i++) {
    const result = moveItemDown(items[i].children, id);
    if (result.success) {
      const newItems = [...items];
      newItems[i] = { ...items[i], children: result.items };
      return { items: newItems, success: true };
    }
  }

  return { items, success: false };
}

// Get previous visible item (for focus navigation)
export function getPreviousItemId(
  items: ListItem[],
  id: string,
  showCompleted: boolean,
): string | null {
  const flatList = flattenItems(items, showCompleted);
  const index = flatList.findIndex((item) => item.id === id);
  if (index > 0) {
    return flatList[index - 1].id;
  }
  return null;
}

// Get next visible item (for focus navigation)
export function getNextItemId(
  items: ListItem[],
  id: string,
  showCompleted: boolean,
): string | null {
  const flatList = flattenItems(items, showCompleted);
  const index = flatList.findIndex((item) => item.id === id);
  if (index !== -1 && index < flatList.length - 1) {
    return flatList[index + 1].id;
  }
  return null;
}

// Flatten items for navigation (respects collapsed and showCompleted)
export function flattenItems(
  items: ListItem[],
  showCompleted: boolean,
): ListItem[] {
  const result: ListItem[] = [];

  for (const item of items) {
    if (!showCompleted && item.completed) continue;

    result.push(item);

    if (!item.collapsed) {
      result.push(...flattenItems(item.children, showCompleted));
    }
  }

  return result;
}

// Flattened item with depth for virtualization
export interface FlattenedItem {
  item: ListItem;
  depth: number;
}

// Flatten items with depth information for virtualized rendering
export function flattenItemsWithDepth(
  items: ListItem[],
  showCompleted: boolean,
  depth: number = 0,
): FlattenedItem[] {
  const result: FlattenedItem[] = [];

  for (const item of items) {
    if (!showCompleted && item.completed) continue;

    result.push({ item, depth });

    if (!item.collapsed && item.children.length > 0) {
      result.push(...flattenItemsWithDepth(item.children, showCompleted, depth + 1));
    }
  }

  return result;
}

// Filter out completed items recursively
export function filterCompleted(items: ListItem[]): ListItem[] {
  return items
    .filter((item) => !item.completed)
    .map((item) => ({
      ...item,
      children: filterCompleted(item.children),
    }));
}

// Get items to display based on focused item
export function getVisibleItems(
  rootItems: ListItem[],
  focusedId: string | null,
): ListItem[] {
  if (!focusedId) return rootItems;

  const focused = findItemById(rootItems, focusedId);
  return focused?.children || [];
}

// Export items to Markdown format
export function exportToMarkdown(
  items: ListItem[],
  indent: number = 0,
): string {
  const lines: string[] = [];
  const indentStr = '  '.repeat(indent);

  for (const item of items) {
    // Main content line
    let line = `${indentStr}- ${item.content}`;
    if (item.completed) {
      line = `${indentStr}- ~~${item.content}~~`;
    }
    lines.push(line);

    // Description as indented text (not a bullet)
    if (item.description) {
      lines.push(`${indentStr}  ${item.description}`);
    }

    // Recursively export children
    if (item.children.length > 0) {
      lines.push(exportToMarkdown(item.children, indent + 1));
    }
  }

  return lines.join('\n');
}

// Import items from Markdown format
export function importFromMarkdown(markdown: string): ListItem[] {
  const lines = markdown.split('\n').filter((line) => line.trim() !== '');
  const result: ListItem[] = [];
  const stack: { items: ListItem[]; indent: number }[] = [
    { items: result, indent: -1 },
  ];

  let lastItem: ListItem | null = null;
  let lastIndent = -1;

  for (const line of lines) {
    // Count leading spaces
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
    const indent = Math.floor(leadingSpaces / 2);
    const trimmedLine = line.trim();

    // Check if this is a bullet point
    if (trimmedLine.startsWith('- ')) {
      let content = trimmedLine.slice(2);
      let completed = false;

      // Check for strikethrough (completed)
      if (content.startsWith('~~') && content.endsWith('~~')) {
        content = content.slice(2, -2);
        completed = true;
      }

      const newItem = createItem(content);
      newItem.completed = completed;

      // Find the right parent based on indentation
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1];
      parent.items.push(newItem);

      // Push this item's children array to stack for potential children
      stack.push({ items: newItem.children, indent });

      lastItem = newItem;
      lastIndent = indent;
    } else if (lastItem && indent > lastIndent) {
      // This is a description line (non-bullet, indented after an item)
      lastItem.description = trimmedLine;
    }
  }

  return result;
}
