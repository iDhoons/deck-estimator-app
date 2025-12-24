import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A hook to manage undo/redo history for a controlled component state.
 * It detects changes in `currentState` and adds them to history,
 * unless the change was triggered by undo/redo actions.
 */
export function useUndoRedo<T>(
    currentState: T,
    onChange: (newState: T) => void,
    options: {
        maxHistory?: number;
        isEqual?: (a: T, b: T) => boolean;
    } = {}
) {
    const { maxHistory = 50, isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b) } = options;

    const [history, setHistory] = useState<T[]>([currentState]);
    const [index, setIndex] = useState(0);
    const isUndoRedoAction = useRef(false);

    const canUndo = index > 0;
    const canRedo = index < history.length - 1;

    // Sync history with external state changes
    useEffect(() => {
        if (isUndoRedoAction.current) {
            isUndoRedoAction.current = false;
            return;
        }

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
    };
}
