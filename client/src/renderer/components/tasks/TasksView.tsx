import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  Box,
  Paper,
  Typography,
  Breadcrumbs,
  FormControlLabel,
  Switch,
  Tooltip,
  Button,
  Modal,
  Fade,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon,
  Home as HomeIcon,
  ChevronRight as ChevronRightIcon,
  FileDownload as ExportIcon,
  FileUpload as ImportIcon,
} from '@mui/icons-material';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import TaskItem from './TaskItem';
import {
  TasksState,
  ListItem,
  getTasksState,
  setTasksState,
  findItemById,
  getBreadcrumbPath,
  getVisibleItems,
  updateItem,
  getPreviousItemId,
  getNextItemId,
  exportToMarkdown,
  importFromMarkdown,
  flattenItemsWithDepth,
  createItem,
} from '../../services/tasks_service';
import {
  CommandManager,
  UpdateContentCommand,
  UpdateDescriptionCommand,
  ToggleCompleteCommand,
  CreateItemCommand,
  CreateFirstItemCommand,
  DeleteItemCommand,
  IndentItemCommand,
  OutdentItemCommand,
  MoveItemUpCommand,
  MoveItemDownCommand,
  MoveItemDragCommand,
} from '../../services/tasks_commands';

import { CmdOrCtrl } from '../../services/os_helper';

export type DropPosition = 'before' | 'inside' | 'after';

// Search result with path for navigation
interface SearchResult {
  item: ListItem;
  path: string[]; // Array of item IDs from root to this item
  pathLabels: string[]; // Content of each item in the path
}

// Search through all items recursively
function searchItems(
  items: ListItem[],
  query: string,
  currentPath: string[] = [],
  currentLabels: string[] = [],
): SearchResult[] {
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  for (const item of items) {
    const newPath = [...currentPath, item.id];
    const newLabels = [...currentLabels, item.content || 'Untitled'];

    // Check if this item matches
    if (item.content.toLowerCase().includes(lowerQuery)) {
      results.push({
        item,
        path: newPath,
        pathLabels: newLabels,
      });
    }

    // Search children
    results.push(...searchItems(item.children, query, newPath, newLabels));
  }

  return results;
}

export default function TasksView() {
  const [state, setState] = useState<TasksState>(() => getTasksState());
  const [focusedInputId, setFocusedInputId] = useState<string | null>(null);
  const [focusCursorPosition, setFocusCursorPosition] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: DropPosition;
  } | null>(null);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  // Description editing state
  const [editingDescriptionId, setEditingDescriptionId] = useState<
    string | null
  >(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drag selection state
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragCurrent, setDragCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Command manager for undo/redo
  const commandManagerRef = useRef(new CommandManager());

  // Force re-render trigger for undo/redo button states
  const [, forceUpdate] = useState({});

  // Execute a command and update state
  const executeCommand = useCallback(
    (command: Parameters<typeof commandManagerRef.current.execute>[0]) => {
      setState((prev) => {
        const newState = commandManagerRef.current.execute(command, prev);
        forceUpdate({}); // Trigger re-render to update undo/redo availability
        return newState;
      });
    },
    [],
  );

  // Undo action
  const undo = useCallback(() => {
    if (!commandManagerRef.current.canUndo()) return;
    setState((prev) => {
      const newState = commandManagerRef.current.undo(prev);
      forceUpdate({});
      return newState;
    });
  }, []);

  // Redo action
  const redo = useCallback(() => {
    if (!commandManagerRef.current.canRedo()) return;
    setState((prev) => {
      const newState = commandManagerRef.current.redo(prev);
      forceUpdate({});
      return newState;
    });
  }, []);

  // Global keyboard handler for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Cmd+Shift+Z - Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      // Cmd+Y - Redo (alternative)
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Persist state changes
  useEffect(() => {
    setTasksState(state);
  }, [state]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Get items to display based on drill-down focus
  const visibleItems = useMemo(
    () => getVisibleItems(state.rootItems, state.focusedItemId),
    [state.rootItems, state.focusedItemId],
  );

  // Flatten items with depth for virtualized rendering
  const flattenedItems = useMemo(() => {
    return flattenItemsWithDepth(visibleItems, state.showCompleted);
  }, [visibleItems, state.showCompleted]);

  // Virtuoso ref for scrolling
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Breadcrumb path for navigation
  const breadcrumbPath = useMemo(
    () => getBreadcrumbPath(state.rootItems, state.focusedItemId),
    [state.rootItems, state.focusedItemId],
  );

  // Get the currently focused item (for drill-down context)
  const focusedItem = useMemo(() => {
    if (!state.focusedItemId) return null;
    return findItemById(state.rootItems, state.focusedItemId);
  }, [state.rootItems, state.focusedItemId]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchItems(state.rootItems, searchQuery.trim()).slice(0, 20);
  }, [state.rootItems, searchQuery]);

  // Reset selected index when search results change
  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [searchResults]);

  // Navigate to a search result
  const handleNavigateToResult = useCallback((result: SearchResult) => {
    // If the item has a parent, navigate to its parent to show it in context
    // Otherwise, if it has children, drill down into it
    if (result.path.length > 1) {
      // Navigate to parent (second to last in path)
      const parentId = result.path[result.path.length - 2];
      setState((prev) => ({ ...prev, focusedItemId: parentId }));
    } else {
      // Item is at root, clear drill-down
      setState((prev) => ({ ...prev, focusedItemId: null }));
    }
    // Focus the item for editing
    setFocusedInputId(result.item.id);
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  // Keyboard handler for search modal
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSearchIndex((prev) =>
          Math.min(prev + 1, searchResults.length - 1),
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSearchIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && searchResults.length > 0) {
        e.preventDefault();
        handleNavigateToResult(searchResults[selectedSearchIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery('');
      }
    },
    [searchResults, selectedSearchIndex, handleNavigateToResult],
  );

  // Global keyboard handler for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle content changes
  const handleContentChange = useCallback(
    (id: string, content: string) => {
      const item = findItemById(state.rootItems, id);
      if (!item || item.content === content) return;
      executeCommand(new UpdateContentCommand(id, content, item.content));
    },
    [state.rootItems, executeCommand],
  );

  // Handle description changes
  const handleDescriptionChange = useCallback(
    (id: string, description: string) => {
      const item = findItemById(state.rootItems, id);
      if (!item || (item.description || '') === description) return;
      executeCommand(
        new UpdateDescriptionCommand(id, description, item.description || ''),
      );
    },
    [state.rootItems, executeCommand],
  );

  // Start/stop editing description
  const handleStartEditDescription = useCallback((id: string | null) => {
    setEditingDescriptionId(id);
  }, []);

  // Toggle completed state
  const handleToggleComplete = useCallback(
    (id: string) => {
      executeCommand(new ToggleCompleteCommand(id));
    },
    [executeCommand],
  );

  // Delete item (or all selected items)
  const handleDelete = useCallback(
    (id: string) => {
      if (selectedIds.has(id) && selectedIds.size > 1) {
        // Delete all selected items
        selectedIds.forEach((selectedId) => {
          executeCommand(new DeleteItemCommand(selectedId));
        });
        setSelectedIds(new Set());
      } else {
        executeCommand(new DeleteItemCommand(id));
        if (selectedIds.has(id)) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    },
    [executeCommand, selectedIds],
  );

  // Copy item(s) to clipboard as Markdown
  const handleCopy = useCallback(
    (id: string) => {
      let itemsToCopy: ListItem[] = [];

      if (selectedIds.has(id) && selectedIds.size > 1) {
        // Copy all selected items
        selectedIds.forEach((selectedId) => {
          const item = findItemById(state.rootItems, selectedId);
          if (item) {
            itemsToCopy.push(item);
          }
        });
      } else {
        // Copy just the clicked item
        const item = findItemById(state.rootItems, id);
        if (item) {
          itemsToCopy = [item];
        }
      }

      if (itemsToCopy.length > 0) {
        const markdown = exportToMarkdown(itemsToCopy);
        navigator.clipboard.writeText(markdown);
      }
    },
    [state.rootItems, selectedIds],
  );

  // Keyboard handler for Cmd/Ctrl+C to copy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        // Only handle if we have selected items or a focused item
        if (selectedIds.size > 0 || focusedInputId) {
          e.preventDefault();

          let itemsToCopy: ListItem[] = [];

          if (selectedIds.size > 0) {
            // Copy all selected items
            selectedIds.forEach((selectedId) => {
              const item = findItemById(state.rootItems, selectedId);
              if (item) {
                itemsToCopy.push(item);
              }
            });
          } else if (focusedInputId) {
            // Copy the focused item
            const item = findItemById(state.rootItems, focusedInputId);
            if (item) {
              itemsToCopy = [item];
            }
          }

          if (itemsToCopy.length > 0) {
            const markdown = exportToMarkdown(itemsToCopy);
            navigator.clipboard.writeText(markdown);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, focusedInputId, state.rootItems]);

  // Calculate selection rectangle
  const selectionRect = useMemo(() => {
    if (!dragStart || !dragCurrent) return null;
    return {
      left: Math.min(dragStart.x, dragCurrent.x),
      top: Math.min(dragStart.y, dragCurrent.y),
      width: Math.abs(dragCurrent.x - dragStart.x),
      height: Math.abs(dragCurrent.y - dragStart.y),
    };
  }, [dragStart, dragCurrent]);

  // Check if an element intersects with the selection rectangle
  const checkIntersection = useCallback(
    (element: HTMLElement) => {
      if (!selectionRect || !listContainerRef.current) return false;
      const containerRect = listContainerRef.current.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Convert element rect to be relative to container
      const relativeRect = {
        left: elementRect.left - containerRect.left,
        top: elementRect.top - containerRect.top,
        right: elementRect.right - containerRect.left,
        bottom: elementRect.bottom - containerRect.top,
      };

      // Check intersection
      return !(
        relativeRect.right < selectionRect.left ||
        relativeRect.left > selectionRect.left + selectionRect.width ||
        relativeRect.bottom < selectionRect.top ||
        relativeRect.top > selectionRect.top + selectionRect.height
      );
    },
    [selectionRect],
  );

  // Minimum distance before drag selection activates (prevents accidental triggers)
  const DRAG_SELECT_THRESHOLD = 10;

  // Check if drag has exceeded threshold
  const isDragSelectActive = useMemo(() => {
    if (!isDragSelecting || !dragStart || !dragCurrent) return false;
    const distance = Math.sqrt(
      Math.pow(dragCurrent.x - dragStart.x, 2) +
        Math.pow(dragCurrent.y - dragStart.y, 2),
    );
    return distance >= DRAG_SELECT_THRESHOLD;
  }, [isDragSelecting, dragStart, dragCurrent]);

  // Update selection during drag (only after threshold)
  useEffect(() => {
    if (!isDragSelectActive || !selectionRect) return;

    const newSelectedIds = new Set<string>();
    itemRefs.current.forEach((element, id) => {
      if (checkIntersection(element)) {
        newSelectedIds.add(id);
      }
    });
    setSelectedIds(newSelectedIds);
  }, [isDragSelectActive, selectionRect, checkIntersection]);

  // Drag selection handlers
  const handleDragSelectStart = useCallback(
    (e: React.MouseEvent) => {
      // Don't start drag selection if dnd-kit drag is active
      if (activeId) return;

      // Only start drag selection on left click and not on interactive elements
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Also exclude bullet-dot which is used for dnd-kit dragging
      if (target.closest('button, [contenteditable], input, textarea, .bullet-dot'))
        return;

      const containerRect = listContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;

      setDragStart({ x, y });
      setDragCurrent({ x, y });
      setIsDragSelecting(true);
    },
    [activeId],
  );

  const handleDragSelectMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragSelecting || !listContainerRef.current) return;

      const containerRect = listContainerRef.current.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;

      setDragCurrent({ x, y });
    },
    [isDragSelecting],
  );

  // Track if drag selection just ended (to prevent click from clearing selection)
  const dragSelectJustEndedRef = useRef(false);

  const handleDragSelectEnd = useCallback(() => {
    // Mark that drag selection just ended if it was active
    if (isDragSelectActive) {
      dragSelectJustEndedRef.current = true;
      // Reset after a short delay (click event fires after mouseup)
      setTimeout(() => {
        dragSelectJustEndedRef.current = false;
      }, 100);
    }
    setIsDragSelecting(false);
    setDragStart(null);
    setDragCurrent(null);
  }, [isDragSelectActive]);

  // Clear selection when clicking outside items
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Don't clear if drag selection just happened
    if (dragSelectJustEndedRef.current) return;

    const target = e.target as HTMLElement;
    // Only clear if clicking on empty space (not on an item or interactive element)
    if (
      !target.closest(
        '[data-task-item], button, [contenteditable], input, textarea',
      )
    ) {
      setSelectedIds(new Set());
    }
  }, []);

  // Register item ref for intersection detection
  const registerItemRef = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) {
        itemRefs.current.set(id, element);
      } else {
        itemRefs.current.delete(id);
      }
    },
    [],
  );

  // Toggle collapsed state
  const handleToggleCollapse = useCallback((id: string) => {
    setState((prev) => {
      const item = findItemById(prev.rootItems, id);
      if (!item) return prev;
      return {
        ...prev,
        rootItems: updateItem(prev.rootItems, id, {
          collapsed: !item.collapsed,
        }),
      };
    });
  }, []);

  // Drill down into an item
  const handleDrillDown = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      focusedItemId: id,
    }));
  }, []);

  // Navigate via breadcrumb
  const handleBreadcrumbNavigate = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      focusedItemId: id,
    }));
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string, currentContent: string, cursorPosition: number | null) => {
      const item = findItemById(state.rootItems, id);
      if (!item) return;

      // Enter - create new sibling (split content at cursor position)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        // Determine text before and after cursor
        const cursorPos = cursorPosition ?? currentContent.length;
        const textBeforeCursor = currentContent.slice(0, cursorPos);
        const textAfterCursor = currentContent.slice(cursorPos);

        // Update current item if cursor was not at end
        if (cursorPos < currentContent.length) {
          executeCommand(new UpdateContentCommand(id, textBeforeCursor, currentContent));
        }

        // Create new item with text after cursor
        const command = new CreateItemCommand(id, createItem(textAfterCursor));
        executeCommand(command);
        setFocusCursorPosition(null); // New item gets cursor at beginning
        setFocusedInputId(command.createdItemId);
      }

      // Tab - indent
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        executeCommand(new IndentItemCommand(id));
      }

      // Shift+Tab - outdent
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        executeCommand(new OutdentItemCommand(id));
      }

      // Backspace on empty - delete item (only when content is truly empty)
      if (e.key === 'Backspace' && currentContent === '') {
        e.preventDefault();
        const prevId = getPreviousItemId(
          state.rootItems,
          id,
          state.showCompleted,
        );
        executeCommand(new DeleteItemCommand(id));
        if (prevId) {
          setFocusedInputId(prevId);
        }
      }

      // Alt+ArrowUp - move item up
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        executeCommand(new MoveItemUpCommand(id));
      }

      // Alt+ArrowDown - move item down
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        executeCommand(new MoveItemDownCommand(id));
      }

      // ArrowUp - navigate to previous item
      if (e.key === 'ArrowUp' && !e.altKey) {
        const prevId = getPreviousItemId(
          state.rootItems,
          id,
          state.showCompleted,
        );
        if (prevId) {
          e.preventDefault();
          setFocusCursorPosition(cursorPosition);
          setFocusedInputId(prevId);
        }
      }

      // ArrowDown - navigate to next item
      if (e.key === 'ArrowDown' && !e.altKey) {
        const nextId = getNextItemId(state.rootItems, id, state.showCompleted);
        if (nextId) {
          e.preventDefault();
          setFocusCursorPosition(cursorPosition);
          setFocusedInputId(nextId);
        }
      }

      // Cmd/Ctrl+Enter - toggle complete
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleToggleComplete(id);
      }

      // Escape - go up one level in drill-down
      if (e.key === 'Escape') {
        e.preventDefault();
        if (breadcrumbPath.length > 1) {
          // Go to parent
          handleBreadcrumbNavigate(
            breadcrumbPath[breadcrumbPath.length - 2].id,
          );
        } else if (state.focusedItemId) {
          // Go to root
          handleBreadcrumbNavigate(null);
        }
      }
    },
    [
      state.rootItems,
      state.showCompleted,
      state.focusedItemId,
      breadcrumbPath,
      executeCommand,
      handleToggleComplete,
      handleBreadcrumbNavigate,
    ],
  );

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Cancel any ongoing drag selection
    setIsDragSelecting(false);
    setDragStart(null);
    setDragCurrent(null);

    setActiveId(event.active.id as string);
    setDropTarget(null);
  }, []);

  // Handle drag over - determine drop position based on cursor
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setDropTarget(null);
      return;
    }

    const overId = over.id as string;
    const overRect = over.rect;

    // Get cursor position relative to the over element
    const cursorY =
      event.delta.y + (event.activatorEvent as PointerEvent).clientY;
    const overTop = overRect.top;
    const overHeight = overRect.height;
    const relativeY = cursorY - overTop;
    const percentage = relativeY / overHeight;

    let position: DropPosition;
    if (percentage < 0.25) {
      position = 'before';
    } else if (percentage > 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    setDropTarget({ id: overId, position });
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event;
      const draggedId = active.id as string;

      if (dropTarget && draggedId !== dropTarget.id) {
        executeCommand(
          new MoveItemDragCommand(
            draggedId,
            dropTarget.id,
            dropTarget.position,
          ),
        );
      }

      setActiveId(null);
      setDropTarget(null);
    },
    [dropTarget, executeCommand],
  );

  // Get active item for drag overlay
  const activeItem = useMemo(() => {
    if (!activeId) return null;
    return findItemById(state.rootItems, activeId);
  }, [activeId, state.rootItems]);

  // Toggle show completed
  const handleToggleShowCompleted = useCallback((checked: boolean) => {
    setState((prev) => ({
      ...prev,
      showCompleted: checked,
    }));
  }, []);

  // Export to Markdown
  const handleExport = useCallback(() => {
    const markdown = exportToMarkdown(state.rootItems);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.rootItems]);

  // Import from Markdown
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const importedItems = importFromMarkdown(content);
          setState((prev) => ({
            ...prev,
            rootItems: [...prev.rootItems, ...importedItems],
          }));
          // Clear command history since we're doing a bulk import
          commandManagerRef.current.clear();
        }
      };
      reader.readAsText(file);

      // Reset input so same file can be imported again
      e.target.value = '';
    },
    [],
  );

  // Drag and drop file import
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    dragCounterRef.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const importedItems = importFromMarkdown(content);
        setState((prev) => ({
          ...prev,
          rootItems: [...prev.rootItems, ...importedItems],
        }));
        commandManagerRef.current.clear();
      }
    };
    reader.readAsText(file);
  }, []);

  // Handle focus
  const handleFocus = useCallback((id: string) => {
    setFocusedInputId(id);
  }, []);

  // Create first item if empty
  const handleCreateFirst = useCallback(() => {
    const command = new CreateFirstItemCommand(state.focusedItemId);
    executeCommand(command);
    setFocusedInputId(command.createdItemId);
  }, [state.focusedItemId, executeCommand]);

  // Global keyboard handler for creating first item
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle if no items exist and Enter is pressed
      if (flattenedItems.length === 0 && e.key === 'Enter') {
        e.preventDefault();
        handleCreateFirst();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [flattenedItems.length, handleCreateFirst]);

  // Virtuoso item renderer
  const renderItem = useCallback(
    (
      _index: number,
      flattenedItem: ReturnType<typeof flattenItemsWithDepth>[0],
    ) => (
      <TaskItem
        key={flattenedItem.item.id}
        item={flattenedItem.item}
        depth={flattenedItem.depth}
        focusedInputId={focusedInputId}
        focusCursorPosition={focusCursorPosition}
        editingDescriptionId={editingDescriptionId}
        dropTarget={dropTarget}
        isSelected={selectedIds.has(flattenedItem.item.id)}
        selectedCount={selectedIds.size}
        onContentChange={handleContentChange}
        onDescriptionChange={handleDescriptionChange}
        onToggleComplete={handleToggleComplete}
        onToggleCollapse={handleToggleCollapse}
        onDrillDown={handleDrillDown}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onStartEditDescription={handleStartEditDescription}
        onDelete={handleDelete}
        onCopy={handleCopy}
        registerRef={registerItemRef}
      />
    ),
    [
      focusedInputId,
      focusCursorPosition,
      editingDescriptionId,
      dropTarget,
      selectedIds,
      handleContentChange,
      handleDescriptionChange,
      handleToggleComplete,
      handleToggleCollapse,
      handleDrillDown,
      handleKeyDown,
      handleFocus,
      handleStartEditDescription,
      handleDelete,
      handleCopy,
      registerItemRef,
    ],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={handleFileDragOver}
      onDrop={handleFileDrop}
    >
      {/* File drop overlay */}
      {isDraggingFile && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(25, 118, 210, 0.1)',
            border: '3px dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              bgcolor: 'background.paper',
              px: 4,
              py: 3,
              borderRadius: 2,
              boxShadow: 2,
              textAlign: 'center',
            }}
          >
            <ImportIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h6" color="primary">
              Drop Markdown file to import
            </Typography>
            <Typography variant="body2" color="text.secondary">
              .md or .txt files supported
            </Typography>
          </Box>
        </Box>
      )}

      {/* Header with breadcrumb and toggle */}
      <Paper
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
        elevation={1}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Breadcrumbs
            separator={<ChevronRightIcon fontSize="small" />}
            sx={{ '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}
          >
            <Tooltip title="Go to root (Escape)">
              <Button
                variant="text"
                size="small"
                onClick={() => handleBreadcrumbNavigate(null)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  textTransform: 'none',
                  minWidth: 'auto',
                  p: 0.5,
                  color: state.focusedItemId
                    ? 'text.secondary'
                    : 'text.primary',
                  fontWeight: state.focusedItemId ? 'normal' : 'bold',
                }}
              >
                <HomeIcon sx={{ mr: 0.5, fontSize: 18 }} />
                Tasks
              </Button>
            </Tooltip>
            {breadcrumbPath.map((item, index) => (
              <Button
                key={item.id}
                variant="text"
                size="small"
                onClick={() => handleBreadcrumbNavigate(item.id)}
                sx={{
                  textTransform: 'none',
                  minWidth: 'auto',
                  p: 0.5,
                  maxWidth: 150,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color:
                    index === breadcrumbPath.length - 1
                      ? 'text.primary'
                      : 'text.secondary',
                  fontWeight:
                    index === breadcrumbPath.length - 1 ? 'bold' : 'normal',
                }}
              >
                {item.content || 'Untitled'}
              </Button>
            ))}
          </Breadcrumbs>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Import from Markdown">
            <Button
              size="small"
              onClick={handleImportClick}
              sx={{ minWidth: 'auto', p: 0.5 }}
            >
              <ImportIcon fontSize="small" />
            </Button>
          </Tooltip>
          <Tooltip title="Export to Markdown">
            <Button
              size="small"
              onClick={handleExport}
              sx={{ minWidth: 'auto', p: 0.5 }}
            >
              <ExportIcon fontSize="small" />
            </Button>
          </Tooltip>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={state.showCompleted}
                onChange={(e) => handleToggleShowCompleted(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                Show completed
              </Typography>
            }
          />
        </Box>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </Paper>

      {/* Items list */}
      <Box
        ref={listContainerRef}
        onClick={handleContainerClick}
        onMouseDown={handleDragSelectStart}
        onMouseMove={handleDragSelectMove}
        onMouseUp={handleDragSelectEnd}
        onMouseLeave={handleDragSelectEnd}
        sx={{
          flex: 1,
          overflow: 'hidden',
          p: 2,
          position: 'relative',
          userSelect: isDragSelectActive ? 'none' : 'auto',
        }}
      >
        {/* Selection rectangle overlay - only shows after threshold */}
        {isDragSelectActive && selectionRect && (
          <Box
            sx={{
              position: 'absolute',
              left: selectionRect.left,
              top: selectionRect.top,
              width: selectionRect.width,
              height: selectionRect.height,
              bgcolor: 'primary.main',
              opacity: 0.1,
              border: '1px solid',
              borderColor: 'primary.main',
              pointerEvents: 'none',
              zIndex: 100,
            }}
          />
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={flattenedItems.map((fi) => fi.item.id)}
            strategy={verticalListSortingStrategy}
          >
            {flattenedItems.length > 0 ? (
              <Virtuoso
                ref={virtuosoRef}
                style={{ height: '100%' }}
                data={flattenedItems}
                itemContent={renderItem}
              />
            ) : null}
          </SortableContext>
          <DragOverlay>
            {activeItem ? (
              <TaskItem
                item={activeItem}
                depth={0}
                focusedInputId={null}
                focusCursorPosition={null}
                editingDescriptionId={null}
                dropTarget={null}
                isSelected={false}
                selectedCount={0}
                onContentChange={() => {}}
                onDescriptionChange={() => {}}
                onToggleComplete={() => {}}
                onToggleCollapse={() => {}}
                onDrillDown={() => {}}
                onKeyDown={() => {}}
                onFocus={() => {}}
                onStartEditDescription={() => {}}
                onDelete={() => {}}
                onCopy={() => {}}
                registerRef={() => {}}
                isDragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Empty state */}
        {flattenedItems.length === 0 && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary',
            }}
          >
            <Typography variant="body1" sx={{ mb: 1 }}>
              {focusedItem
                ? `"${focusedItem.content || 'Untitled'}" has no items`
                : 'No tasks yet'}
            </Typography>
            <Typography variant="body2">
              Press Enter to create your first item
            </Typography>
            <Box sx={{ mt: 3, textAlign: 'left' }}>
              <Typography
                variant="caption"
                color="text.disabled"
                component="div"
              >
                Keyboard shortcuts:
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                component="div"
              >
                Enter - New item | Tab - Indent | Shift+Tab - Outdent
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                component="div"
              >
                Alt+Arrow - Move | {CmdOrCtrl}+Enter - Complete | Escape - Go up
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                component="div"
              >
                {CmdOrCtrl}+K - Search and navigate
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Search Modal */}
      <Modal
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchQuery('');
        }}
      >
        <Fade in={searchOpen}>
          <Box
            sx={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 500,
              maxWidth: '90vw',
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: 24,
              outline: 'none',
            }}
          >
            <TextField
              autoFocus
              fullWidth
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: searchResults.length > 0 ? '8px 8px 0 0' : 2,
                },
              }}
            />
            {searchResults.length > 0 && (
              <List
                sx={{
                  maxHeight: 300,
                  overflow: 'auto',
                  borderTop: 1,
                  borderColor: 'divider',
                  py: 0,
                }}
              >
                {searchResults.map((result, index) => (
                  <ListItemButton
                    key={result.item.id}
                    selected={index === selectedSearchIndex}
                    onClick={() => handleNavigateToResult(result)}
                    sx={{
                      py: 1,
                      '&.Mui-selected': {
                        bgcolor: 'primary.light',
                      },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Typography
                          sx={{
                            textDecoration: result.item.completed
                              ? 'line-through'
                              : 'none',
                            color: result.item.completed
                              ? 'text.disabled'
                              : 'text.primary',
                          }}
                        >
                          {result.item.content || 'Untitled'}
                        </Typography>
                      }
                      secondary={
                        result.pathLabels.length > 1 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {result.pathLabels.slice(0, -1).join(' > ')}
                          </Typography>
                        )
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            {searchQuery && searchResults.length === 0 && (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography color="text.secondary">No items found</Typography>
              </Box>
            )}
          </Box>
        </Fade>
      </Modal>
    </Box>
  );
}
