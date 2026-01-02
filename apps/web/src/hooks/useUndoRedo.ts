import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A hook to manage undo/redo history for a controlled component state.
 * It detects changes in `currentState` and adds them to history,
 * unless the change was triggered by undo/redo actions or paused.
 *
 * Use `pause()` before drag starts and `commit()` after drag ends
 * to save history only on pointerUp (click-based undo/redo).
 */
export function useUndoRedo<T>(
  currentState: T,
  onChange: (newState: T) => void,
  options: {
    maxHistory?: number;
    isEqual?: (a: T, b: T) => boolean;
  } = {},
) {
  const { maxHistory = 50, isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b) } = options;

  const [history, setHistory] = useState<T[]>([currentState]);
  const [index, setIndex] = useState(0);
  const isUndoRedoAction = useRef(false);
  const isPaused = useRef(false);
  const stateBeforePause = useRef<T | null>(null);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  // Pause history recording (call before drag starts)
  const pause = useCallback(() => {
    if (!isPaused.current) {
      isPaused.current = true;
      stateBeforePause.current = currentState;
    }
  }, [currentState]);

  // Commit current state to history (call after drag ends)
  const commit = useCallback(() => {
    if (!isPaused.current) return;
    isPaused.current = false;

    const lastState = history[index];
    // Only commit if state actually changed from the state before pause
    if (stateBeforePause.current !== null && isEqual(stateBeforePause.current, currentState)) {
      stateBeforePause.current = null;
      return;
    }

    // If state hasn't changed from last history entry, skip
    if (isEqual(lastState, currentState)) {
      stateBeforePause.current = null;
      return;
    }

    // Truncate future history if we're not at the end
    const newHistory = history.slice(0, index + 1);
    newHistory.push(currentState);

    // Limit history size
    if (newHistory.length > maxHistory) {
      newHistory.shift();
      setHistory(newHistory);
      setIndex(newHistory.length - 1);
    } else {
      setHistory(newHistory);
      setIndex(newHistory.length - 1);
    }

    stateBeforePause.current = null;
  }, [currentState, history, index, maxHistory, isEqual]);

  // Sync history with external state changes (only when not paused)
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    // Skip auto-recording when paused (during drag)
    if (isPaused.current) return;

    const lastState = history[index];
    // If state hasn't effectively changed, do nothing
    if (isEqual(lastState, currentState)) return;

    // Truncate future history if we're not at the end
    const newHistory = history.slice(0, index + 1);
    newHistory.push(currentState);

    // Limit history size
    if (newHistory.length > maxHistory) {
      newHistory.shift();
      setHistory(newHistory);
      setIndex(newHistory.length - 1);
    } else {
      setHistory(newHistory);
      setIndex(newHistory.length - 1);
    }
  }, [currentState, history, index, maxHistory, isEqual]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    isUndoRedoAction.current = true;
    const newIndex = index - 1;
    setIndex(newIndex);
    onChange(history[newIndex]);
  }, [canUndo, index, history, onChange]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    isUndoRedoAction.current = true;
    const newIndex = index + 1;
    setIndex(newIndex);
    onChange(history[newIndex]);
  }, [canRedo, index, history, onChange]);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    history,
    index,
    pause,
    commit,
  };
}
