import React, { useRef, useEffect, useLayoutEffect, useState, memo } from 'react';
import { Box, IconButton, Typography, Menu, MenuItem } from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  SubdirectoryArrowRight as IndentIcon,
  MoreHoriz as MoreIcon,
  Delete as DeleteIcon,
  CheckCircle as CompleteIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ListItem } from '../../services/tasks_service';
import { DropPosition } from './TasksView';

interface TaskItemProps {
  item: ListItem;
  depth: number;
  focusedInputId: string | null;
  focusCursorPosition: number | null;
  editingDescriptionId: string | null;
  dropTarget: { id: string; position: DropPosition } | null;
  isSelected: boolean;
  selectedCount: number;
  onContentChange: (id: string, content: string) => void;
  onDescriptionChange: (id: string, description: string) => void;
  onToggleComplete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDrillDown: (id: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent,
    id: string,
    currentContent: string,
    cursorPosition: number | null,
  ) => void;
  onFocus: (id: string) => void;
  onStartEditDescription: (id: string | null) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  registerRef: (id: string, element: HTMLElement | null) => void;
  isDragOverlay?: boolean;
}

function TaskItemComponent({
  item,
  depth,
  focusedInputId,
  focusCursorPosition,
  editingDescriptionId,
  dropTarget,
  isSelected,
  selectedCount,
  onContentChange,
  onDescriptionChange,
  onToggleComplete,
  onToggleCollapse,
  onDrillDown,
  onKeyDown,
  onFocus,
  onStartEditDescription,
  onDelete,
  onCopy,
  registerRef,
  isDragOverlay = false,
}: TaskItemProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const itemContainerRef = useRef<HTMLDivElement>(null);
  const [localContent, setLocalContent] = useState(item.content);
  const [localDescription, setLocalDescription] = useState(
    item.description || '',
  );
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const isEditingDescription = editingDescriptionId === item.id;
  const isMenuOpen = Boolean(menuAnchor);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Check if this item is the drop target
  const isDropTarget = dropTarget?.id === item.id;
  const dropPosition = isDropTarget ? dropTarget.position : null;

  // Sync local content with item content when item changes externally
  // Use useLayoutEffect to ensure this runs synchronously before blur events
  useLayoutEffect(() => {
    setLocalContent(item.content);
    // Also update the DOM content since React doesn't manage contentEditable
    if (inputRef.current && inputRef.current.textContent !== item.content) {
      inputRef.current.textContent = item.content;
    }
  }, [item.content]);

  // Sync local description with item description when item changes externally
  useEffect(() => {
    setLocalDescription(item.description || '');
  }, [item.description]);

  // Focus input when this item should be focused
  useEffect(() => {
    if (focusedInputId === item.id && inputRef.current && !isDragOverlay) {
      inputRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      const textNode = inputRef.current.firstChild;
      const contentLength = inputRef.current.textContent?.length || 0;

      if (focusCursorPosition !== null && textNode) {
        // Place cursor at the specified position (clamped to content length)
        const pos = Math.min(focusCursorPosition, contentLength);
        range.setStart(textNode, pos);
      } else if (textNode) {
        // Place cursor at beginning
        range.setStart(textNode, 0);
      } else {
        // Empty content, set at start of element
        range.setStart(inputRef.current, 0);
      }
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [focusedInputId, focusCursorPosition, item.id, isDragOverlay]);

  // Focus description input when editing description
  useEffect(() => {
    if (isEditingDescription && descriptionRef.current && !isDragOverlay) {
      descriptionRef.current.focus();
      // Place cursor at end
      const range = document.createRange();
      const sel = window.getSelection();
      if (descriptionRef.current.childNodes.length > 0) {
        range.setStartAfter(descriptionRef.current.lastChild!);
      } else {
        range.setStart(descriptionRef.current, 0);
      }
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditingDescription, isDragOverlay]);

  // Register/unregister element ref for drag selection intersection detection
  useEffect(() => {
    if (isDragOverlay) return;
    registerRef(item.id, itemContainerRef.current);
    return () => {
      registerRef(item.id, null);
    };
  }, [item.id, registerRef, isDragOverlay]);

  const handleBlur = () => {
    // Read current content from DOM since localContent state might be stale
    const currentContent = inputRef.current?.textContent || '';
    if (currentContent !== item.content) {
      onContentChange(item.id, currentContent);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    setLocalContent(e.currentTarget.textContent || '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Shift+Enter - start editing description
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      onStartEditDescription(item.id);
      return;
    }

    // Get cursor position for keys that need it (Enter for split, Arrow keys for navigation)
    let cursorPosition: number | null = null;
    const needsCursorPosition =
      (e.key === 'Enter' && !e.shiftKey) ||
      (e.key === 'ArrowUp' && !e.altKey) ||
      (e.key === 'ArrowDown' && !e.altKey);

    if (needsCursorPosition && inputRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        // Calculate offset from start of contentEditable
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(inputRef.current);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        cursorPosition = preCaretRange.toString().length;
      }
    }

    onKeyDown(e, item.id, localContent, cursorPosition);
  };

  const handleDescriptionBlur = () => {
    if (localDescription !== (item.description || '')) {
      onDescriptionChange(item.id, localDescription);
    }
    onStartEditDescription(null);
  };

  const handleDescriptionInput = (e: React.FormEvent<HTMLDivElement>) => {
    setLocalDescription(e.currentTarget.textContent || '');
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    // Escape - stop editing description
    if (e.key === 'Escape') {
      e.preventDefault();
      onStartEditDescription(null);
      // Return focus to content
      inputRef.current?.focus();
      return;
    }
    // Enter - save and stop editing (in description, Enter doesn't create new item)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (localDescription !== (item.description || '')) {
        onDescriptionChange(item.id, localDescription);
      }
      onStartEditDescription(null);
      inputRef.current?.focus();
      return;
    }
  };

  // Menu handlers
  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleMenuDelete = () => {
    handleMenuClose();
    onDelete(item.id);
  };

  const handleMenuComplete = () => {
    handleMenuClose();
    onToggleComplete(item.id);
  };

  const handleMenuCopy = () => {
    handleMenuClose();
    onCopy(item.id);
  };

  const hasChildren = item.children.length > 0;

  // Drag overlay style - shown when dragging
  if (isDragOverlay) {
    return (
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderRadius: 0.5,
          boxShadow: 2,
          border: '1px solid',
          borderColor: 'primary.main',
          px: 1,
          py: 0.5,
          opacity: 0.75,
          maxWidth: 250,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: item.completed ? 'text.disabled' : 'text.secondary',
              flexShrink: 0,
            }}
          />
          <Typography
            noWrap
            sx={{
              fontSize: '0.8rem',
              textDecoration: item.completed ? 'line-through' : 'none',
              color: item.completed ? 'text.disabled' : 'text.primary',
            }}
          >
            {item.content || 'Empty item'}
          </Typography>
          {hasChildren && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: '0.7rem' }}
            >
              +{item.children.length}
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box ref={setNodeRef} style={style}>
      {/* Drop indicator - BEFORE */}
      {dropPosition === 'before' && (
        <Box
          sx={{
            height: 2,
            bgcolor: 'primary.main',
            borderRadius: 1,
            ml: depth * 3 + 4,
            mr: 2,
            mb: 0.5,
          }}
        />
      )}

      <Box
        ref={itemContainerRef}
        data-task-item
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          pl: depth * 3,
          py: 0.25,
          borderRadius: 1,
          bgcolor: isDragging
            ? 'action.selected'
            : isSelected
            ? 'primary.light'
            : dropPosition === 'inside'
            ? 'primary.light'
            : 'transparent',
          opacity: isDragging ? 0.4 : 1,
          border: isSelected
            ? '1px solid'
            : dropPosition === 'inside'
            ? '2px dashed'
            : 'none',
          borderColor: 'primary.main',
          transition: 'background-color 0.15s, border 0.15s',
          '&:hover .hover-control': {
            opacity: 1,
          },
        }}
      >
        {/* More options button - appears on hover, far left */}
        <IconButton
          size="small"
          className="hover-control"
          onClick={handleMenuOpen}
          sx={{
            opacity: isMenuOpen ? 1 : 0,
            transition: 'opacity 0.15s',
            p: 0.25,
            mr: 0.25,
          }}
        >
          <MoreIcon fontSize="small" sx={{ fontSize: 16, color: 'text.secondary' }} />
        </IconButton>

        {/* Options menu */}
        <Menu
          anchorEl={menuAnchor}
          open={isMenuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          <MenuItem onClick={handleMenuComplete} sx={{ gap: 1 }}>
            <CompleteIcon fontSize="small" />
            {item.completed ? 'Mark as incomplete' : 'Mark as complete'}
          </MenuItem>
          <MenuItem onClick={handleMenuCopy} sx={{ gap: 1 }}>
            <CopyIcon fontSize="small" />
            {isSelected && selectedCount > 1 ? `Copy ${selectedCount} items` : 'Copy'}
          </MenuItem>
          <MenuItem onClick={handleMenuDelete} sx={{ gap: 1, color: 'error.main' }}>
            <DeleteIcon fontSize="small" />
            {isSelected && selectedCount > 1 ? `Delete ${selectedCount} items` : 'Delete'}
          </MenuItem>
        </Menu>

        {/* Collapse/expand toggle - always visible for items with children */}
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={() => onToggleCollapse(item.id)}
            sx={{
              width: 20,
              height: 20,
              p: 0,
              mr: 0.5,
            }}
          >
            {item.collapsed ? (
              <ChevronRightIcon fontSize="small" sx={{ fontSize: 16, color: 'text.secondary' }} />
            ) : (
              <ExpandMoreIcon fontSize="small" sx={{ fontSize: 16, color: 'text.secondary' }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 20, height: 20, mr: 0.5, flexShrink: 0 }} />
        )}

        {/* Bullet - click to drill down, drag to reorder */}
        <Box
          onClick={() => onDrillDown(item.id)}
          onDoubleClick={() => onToggleComplete(item.id)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            flexShrink: 0,
            cursor: 'pointer',
            '&:hover .bullet-dot': {
              transform: 'scale(1.3)',
            },
          }}
          {...attributes}
          {...listeners}
        >
          <Box
            className="bullet-dot"
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: item.completed ? 'text.disabled' : 'text.secondary',
              transition: 'transform 0.1s',
            }}
          />
        </Box>

        {/* Content and Description container */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Content - inline editable */}
          <Typography
            ref={inputRef}
            component="div"
            contentEditable={!isDragging}
            suppressContentEditableWarning
            onBlur={handleBlur}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => onFocus(item.id)}
            sx={{
              outline: 'none',
              minHeight: 24,
              lineHeight: '24px',
              fontSize: '0.95rem',
              textDecoration: item.completed ? 'line-through' : 'none',
              color: item.completed ? 'text.disabled' : 'text.primary',
              borderRadius: 0.5,
              px: 0.5,
              '&:focus': {
                bgcolor: 'action.hover',
              },
              '&:empty::before': {
                content: '""',
                display: 'inline-block',
              },
            }}
          >
            {item.content}
          </Typography>

          {/* Description - shown when has content or editing */}
          {(item.description || isEditingDescription) && (
            <Typography
              ref={descriptionRef}
              component="div"
              contentEditable={!isDragging}
              suppressContentEditableWarning
              onBlur={handleDescriptionBlur}
              onInput={handleDescriptionInput}
              onKeyDown={handleDescriptionKeyDown}
              onClick={() => onStartEditDescription(item.id)}
              sx={{
                outline: 'none',
                minHeight: isEditingDescription ? 20 : 'auto',
                lineHeight: '20px',
                fontSize: '0.8rem',
                color: 'text.secondary',
                borderRadius: 0.5,
                px: 0.5,
                ml: 0,
                '&:focus': {
                  bgcolor: 'action.hover',
                },
                '&:empty::before': {
                  content: isEditingDescription ? '"Add description..."' : '""',
                  color: 'text.disabled',
                  fontStyle: 'italic',
                },
              }}
            >
              {item.description}
            </Typography>
          )}
        </Box>

        {/* Indent indicator when dropping inside */}
        {dropPosition === 'inside' && (
          <IndentIcon
            fontSize="small"
            color="primary"
            sx={{ ml: 1, opacity: 0.7 }}
          />
        )}
      </Box>

      {/* Drop indicator - AFTER */}
      {dropPosition === 'after' && (
        <Box
          sx={{
            height: 2,
            bgcolor: 'primary.main',
            borderRadius: 1,
            ml: depth * 3 + 4,
            mr: 2,
            mt: 0.5,
          }}
        />
      )}
    </Box>
  );
}

// Custom comparison function to prevent unnecessary re-renders
function arePropsEqual(
  prevProps: TaskItemProps,
  nextProps: TaskItemProps,
): boolean {
  // Always re-render if item data changed
  if (prevProps.item.id !== nextProps.item.id) return false;
  if (prevProps.item.content !== nextProps.item.content) return false;
  if (prevProps.item.description !== nextProps.item.description) return false;
  if (prevProps.item.completed !== nextProps.item.completed) return false;
  if (prevProps.item.collapsed !== nextProps.item.collapsed) return false;
  if (prevProps.item.children.length !== nextProps.item.children.length) return false;

  // Re-render if this item's focus state changed
  const wasFocused = prevProps.focusedInputId === prevProps.item.id;
  const isFocused = nextProps.focusedInputId === nextProps.item.id;
  if (wasFocused !== isFocused) return false;
  // Re-render if cursor position changed while focused
  if (isFocused && prevProps.focusCursorPosition !== nextProps.focusCursorPosition) return false;

  // Re-render if this item's description editing state changed
  const wasEditingDesc = prevProps.editingDescriptionId === prevProps.item.id;
  const isEditingDesc = nextProps.editingDescriptionId === nextProps.item.id;
  if (wasEditingDesc !== isEditingDesc) return false;

  // Re-render if this item is/was a drop target
  const wasDropTarget = prevProps.dropTarget?.id === prevProps.item.id;
  const isDropTarget = nextProps.dropTarget?.id === nextProps.item.id;
  if (wasDropTarget !== isDropTarget) return false;
  if (isDropTarget && prevProps.dropTarget?.position !== nextProps.dropTarget?.position) return false;

  // Re-render if display settings changed
  if (prevProps.depth !== nextProps.depth) return false;
  if (prevProps.isDragOverlay !== nextProps.isDragOverlay) return false;

  // Re-render if selection state changed
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  // Re-render if selectedCount changes while selected (for menu text)
  if (nextProps.isSelected && prevProps.selectedCount !== nextProps.selectedCount) return false;

  return true;
}

const TaskItem = memo(TaskItemComponent, arePropsEqual);
export default TaskItem;
