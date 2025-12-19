/**
 * Command pattern implementation for task list operations.
 * Each command knows how to execute and undo itself.
 */

import {
  ListItem,
  TasksState,
  createItem,
  findItemById,
  findParent,
  updateItem,
  removeItem,
  insertItem,
  insertSiblingAfter,
  indentItem,
  outdentItem,
  moveItemUp,
  moveItemDown,
} from './tasks_service';

// Base command interface
export interface Command {
  type: string;
  execute(state: TasksState): TasksState;
  undo(state: TasksState): TasksState;
}

// Command: Update item content
export class UpdateContentCommand implements Command {
  type = 'UPDATE_CONTENT';
  private itemId: string;
  private newContent: string;
  private oldContent: string;

  constructor(itemId: string, newContent: string, oldContent: string) {
    this.itemId = itemId;
    this.newContent = newContent;
    this.oldContent = oldContent;
  }

  execute(state: TasksState): TasksState {
    return {
      ...state,
      rootItems: updateItem(state.rootItems, this.itemId, {
        content: this.newContent,
      }),
    };
  }

  undo(state: TasksState): TasksState {
    return {
      ...state,
      rootItems: updateItem(state.rootItems, this.itemId, {
        content: this.oldContent,
      }),
    };
  }
}

// Command: Update item description
export class UpdateDescriptionCommand implements Command {
  type = 'UPDATE_DESCRIPTION';
  private itemId: string;
  private newDescription: string;
  private oldDescription: string;

  constructor(itemId: string, newDescription: string, oldDescription: string) {
    this.itemId = itemId;
    this.newDescription = newDescription;
    this.oldDescription = oldDescription;
  }

  execute(state: TasksState): TasksState {
    return {
      ...state,
      rootItems: updateItem(state.rootItems, this.itemId, {
        description: this.newDescription,
      }),
    };
  }

  undo(state: TasksState): TasksState {
    return {
      ...state,
      rootItems: updateItem(state.rootItems, this.itemId, {
        description: this.oldDescription,
      }),
    };
  }
}

// Command: Toggle item completed
export class ToggleCompleteCommand implements Command {
  type = 'TOGGLE_COMPLETE';
  private itemId: string;

  constructor(itemId: string) {
    this.itemId = itemId;
  }

  execute(state: TasksState): TasksState {
    const item = findItemById(state.rootItems, this.itemId);
    if (!item) return state;
    return {
      ...state,
      rootItems: updateItem(state.rootItems, this.itemId, {
        completed: !item.completed,
      }),
    };
  }

  undo(state: TasksState): TasksState {
    // Toggle is its own inverse
    return this.execute(state);
  }
}

// Command: Create new item after another
export class CreateItemCommand implements Command {
  type = 'CREATE_ITEM';
  private afterItemId: string;
  private newItem: ListItem;

  constructor(afterItemId: string, newItem?: ListItem) {
    this.afterItemId = afterItemId;
    this.newItem = newItem || createItem('');
  }

  get createdItemId(): string {
    return this.newItem.id;
  }

  execute(state: TasksState): TasksState {
    return {
      ...state,
      rootItems: insertSiblingAfter(
        state.rootItems,
        this.afterItemId,
        this.newItem,
      ),
    };
  }

  undo(state: TasksState): TasksState {
    return {
      ...state,
      rootItems: removeItem(state.rootItems, this.newItem.id),
    };
  }
}

// Command: Create first item (at root or as child of focused)
export class CreateFirstItemCommand implements Command {
  type = 'CREATE_FIRST_ITEM';
  private parentId: string | null;
  private newItem: ListItem;

  constructor(parentId: string | null, newItem?: ListItem) {
    this.parentId = parentId;
    this.newItem = newItem || createItem('');
  }

  get createdItemId(): string {
    return this.newItem.id;
  }

  execute(state: TasksState): TasksState {
    if (this.parentId) {
      const parent = findItemById(state.rootItems, this.parentId);
      if (!parent) return state;
      return {
        ...state,
        rootItems: updateItem(state.rootItems, this.parentId, {
          children: [...parent.children, this.newItem],
        }),
      };
    }
    return {
      ...state,
      rootItems: [...state.rootItems, this.newItem],
    };
  }

  undo(state: TasksState): TasksState {
    return {
      ...state,
      rootItems: removeItem(state.rootItems, this.newItem.id),
    };
  }
}

// Command: Delete item
export class DeleteItemCommand implements Command {
  type = 'DELETE_ITEM';
  private itemId: string;
  private deletedItem: ListItem | null = null;
  private parentId: string | null = null;
  private indexInParent: number = 0;

  constructor(itemId: string) {
    this.itemId = itemId;
  }

  execute(state: TasksState): TasksState {
    // Store item and its position for undo
    this.deletedItem = findItemById(state.rootItems, this.itemId);
    if (!this.deletedItem) return state;

    const parent = findParent(state.rootItems, this.itemId);
    this.parentId = parent?.id || null;

    const siblings = parent ? parent.children : state.rootItems;
    this.indexInParent = siblings.findIndex((i) => i.id === this.itemId);

    return {
      ...state,
      rootItems: removeItem(state.rootItems, this.itemId),
    };
  }

  undo(state: TasksState): TasksState {
    if (!this.deletedItem) return state;

    return {
      ...state,
      rootItems: insertItem(
        state.rootItems,
        this.parentId,
        this.deletedItem,
        this.indexInParent,
      ),
    };
  }
}

// Command: Indent item
export class IndentItemCommand implements Command {
  type = 'INDENT_ITEM';
  private itemId: string;
  private success: boolean = false;

  constructor(itemId: string) {
    this.itemId = itemId;
  }

  execute(state: TasksState): TasksState {
    const result = indentItem(state.rootItems, this.itemId);
    this.success = result.success;
    if (!result.success) return state;
    return { ...state, rootItems: result.items };
  }

  undo(state: TasksState): TasksState {
    if (!this.success) return state;
    const result = outdentItem(state.rootItems, this.itemId);
    return result.success ? { ...state, rootItems: result.items } : state;
  }
}

// Command: Outdent item
export class OutdentItemCommand implements Command {
  type = 'OUTDENT_ITEM';
  private itemId: string;
  private success: boolean = false;

  constructor(itemId: string) {
    this.itemId = itemId;
  }

  execute(state: TasksState): TasksState {
    const result = outdentItem(state.rootItems, this.itemId);
    this.success = result.success;
    if (!result.success) return state;
    return { ...state, rootItems: result.items };
  }

  undo(state: TasksState): TasksState {
    if (!this.success) return state;
    const result = indentItem(state.rootItems, this.itemId);
    return result.success ? { ...state, rootItems: result.items } : state;
  }
}

// Command: Move item up
export class MoveItemUpCommand implements Command {
  type = 'MOVE_ITEM_UP';
  private itemId: string;
  private success: boolean = false;

  constructor(itemId: string) {
    this.itemId = itemId;
  }

  execute(state: TasksState): TasksState {
    const result = moveItemUp(state.rootItems, this.itemId);
    this.success = result.success;
    if (!result.success) return state;
    return { ...state, rootItems: result.items };
  }

  undo(state: TasksState): TasksState {
    if (!this.success) return state;
    const result = moveItemDown(state.rootItems, this.itemId);
    return result.success ? { ...state, rootItems: result.items } : state;
  }
}

// Command: Move item down
export class MoveItemDownCommand implements Command {
  type = 'MOVE_ITEM_DOWN';
  private itemId: string;
  private success: boolean = false;

  constructor(itemId: string) {
    this.itemId = itemId;
  }

  execute(state: TasksState): TasksState {
    const result = moveItemDown(state.rootItems, this.itemId);
    this.success = result.success;
    if (!result.success) return state;
    return { ...state, rootItems: result.items };
  }

  undo(state: TasksState): TasksState {
    if (!this.success) return state;
    const result = moveItemUp(state.rootItems, this.itemId);
    return result.success ? { ...state, rootItems: result.items } : state;
  }
}

// Command: Move item via drag and drop
export class MoveItemDragCommand implements Command {
  type = 'MOVE_ITEM_DRAG';
  private itemId: string;
  private targetId: string;
  private position: 'before' | 'inside' | 'after';

  // Store original position for undo
  private originalParentId: string | null = null;
  private originalIndex: number = 0;

  constructor(
    itemId: string,
    targetId: string,
    position: 'before' | 'inside' | 'after',
  ) {
    this.itemId = itemId;
    this.targetId = targetId;
    this.position = position;
  }

  execute(state: TasksState): TasksState {
    const item = findItemById(state.rootItems, this.itemId);
    if (!item) return state;

    // Store original position
    const originalParent = findParent(state.rootItems, this.itemId);
    this.originalParentId = originalParent?.id || null;
    const originalSiblings = originalParent
      ? originalParent.children
      : state.rootItems;
    this.originalIndex = originalSiblings.findIndex(
      (i) => i.id === this.itemId,
    );

    // Clone item
    const itemToMove: ListItem = { ...item, children: [...item.children] };

    // Remove from current position
    let newRootItems = removeItem(state.rootItems, this.itemId);

    // Find target
    const targetItem = findItemById(newRootItems, this.targetId);
    if (!targetItem) return state;

    const targetParent = findParent(newRootItems, this.targetId);
    const targetParentId = targetParent?.id || null;
    const siblings = targetParentId ? targetParent!.children : newRootItems;
    const targetIndex = siblings.findIndex((i) => i.id === this.targetId);

    if (this.position === 'before') {
      newRootItems = insertItem(
        newRootItems,
        targetParentId,
        itemToMove,
        targetIndex,
      );
    } else if (this.position === 'after') {
      newRootItems = insertItem(
        newRootItems,
        targetParentId,
        itemToMove,
        targetIndex + 1,
      );
    } else {
      // inside - add as first child
      newRootItems = updateItem(newRootItems, this.targetId, {
        children: [itemToMove, ...targetItem.children],
        collapsed: false,
      });
    }

    return { ...state, rootItems: newRootItems };
  }

  undo(state: TasksState): TasksState {
    const item = findItemById(state.rootItems, this.itemId);
    if (!item) return state;

    const itemToMove: ListItem = { ...item, children: [...item.children] };
    let newRootItems = removeItem(state.rootItems, this.itemId);

    newRootItems = insertItem(
      newRootItems,
      this.originalParentId,
      itemToMove,
      this.originalIndex,
    );

    return { ...state, rootItems: newRootItems };
  }
}

// Command Manager - single point of execution
export class CommandManager {
  private history: Command[] = [];
  private future: Command[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }

  execute(command: Command, state: TasksState): TasksState {
    const newState = command.execute(state);

    // Only add to history if state actually changed
    if (newState !== state) {
      this.history.push(command);
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
      // Clear future when new command is executed
      this.future = [];
    }

    return newState;
  }

  undo(state: TasksState): TasksState {
    if (this.history.length === 0) return state;

    const command = this.history.pop()!;
    const newState = command.undo(state);
    this.future.unshift(command);

    return newState;
  }

  redo(state: TasksState): TasksState {
    if (this.future.length === 0) return state;

    const command = this.future.shift()!;
    const newState = command.execute(state);
    this.history.push(command);

    return newState;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.history = [];
    this.future = [];
  }
}
