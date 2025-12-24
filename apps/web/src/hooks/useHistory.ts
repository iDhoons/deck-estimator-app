import { useCallback, useState } from "react";

export interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
}

export function useHistory<T>(initialPresent: T) {
    const [state, setState] = useState<HistoryState<T>>({
        past: [],
        present: initialPresent,
        future: [],
    });

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const undo = useCallback(() => {
        setState((prevState) => {
            const { past, present, future } = prevState;
            if (past.length === 0) return prevState;

            const previous = past[past.length - 1];
            const newPast = past.slice(0, past.length - 1);

            return {
                past: newPast,
                present: previous,
                future: [present, ...future],
            };
        });
    }, []);

    const redo = useCallback(() => {
        setState((prevState) => {
            const { past, present, future } = prevState;
            if (future.length === 0) return prevState;

            const next = future[0];
            const newFuture = future.slice(1);

            return {
                past: [...past, present],
                present: next,
                future: newFuture,
            };
        });
    }, []);

    const set = useCallback(
        (newPresent: T | ((current: T) => T)) => {
            setState((prevState) => {
                const { past, present } = prevState;
                const nextPresent =
                    typeof newPresent === "function"
                        ? (newPresent as (current: T) => T)(present)
                        : newPresent;

                if (nextPresent === present) return prevState;

                return {
                    past: [...past, present],
                    present: nextPresent,
                    future: [], // Clear future on new change
                };
            });
        },
        []
    );

    const reset = useCallback((newPresent: T) => {
        setState({
            past: [],
            present: newPresent,
            future: []
        });
    }, []);

    return {
        state: state.present,
        set,
        undo,
        redo,
        canUndo,
        canRedo,
        historyState: state, // Access full state if needed
        reset,
    };
}
