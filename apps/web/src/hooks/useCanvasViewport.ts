import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from "react";

export type ViewportState = {
    viewBox: { x: number; y: number; w: number; h: number };
    scale: number;
    rotation: number;
    isPanning: boolean;
};

type ViewportOptions = {
    initialViewBox?: { x: number; y: number; w: number; h: number };
    minScale?: number;
    maxScale?: number;
};

const DEFAULT_VIEWBOX = { x: 0, y: 0, w: 2000, h: 1200 };

export function useCanvasViewport(
    svgRef: React.RefObject<SVGSVGElement | null>,
    options: ViewportOptions = {}
) {
    const {
        initialViewBox = DEFAULT_VIEWBOX,
        minScale = 0.2,
        maxScale = 5,
    } = options;

    const [viewBox, setViewBox] = useState(initialViewBox);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [isPanning, setIsPanning] = useState(false);

    const panPointerIdRef = useRef<number | null>(null);
    const panStartClientRef = useRef<{ x: number; y: number } | null>(null);
    const panStartViewBoxRef = useRef<{ x: number; y: number } | null>(null);
    const panScaleRef = useRef<{ x: number; y: number } | null>(null);

    const centerX = viewBox.x + viewBox.w / 2;
    const centerY = viewBox.y + viewBox.h / 2;

    const transformGroup = `translate(${centerX} ${centerY}) rotate(${rotation}) scale(${scale}) translate(${-centerX} ${-centerY})`;

    const toSvgCoords = useCallback(
        (clientX: number, clientY: number) => {
            const svg = svgRef.current;
            if (!svg) return null;
            const point = svg.createSVGPoint();
            point.x = clientX;
            point.y = clientY;
            const matrix = svg.getScreenCTM();
            if (!matrix) return null;
            const { x, y } = point.matrixTransform(matrix.inverse());
            return { x, y };
        },
        [svgRef]
    );

    const transformPoint = useCallback(
        (x: number, y: number) => {
            // 1. translate to center
            const tx = x - centerX;
            const ty = y - centerY;
            // 2. rotate
            const rad = (rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rx = tx * cos - ty * sin;
            const ry = tx * sin + ty * cos;
            // 3. scale
            const sx = rx * scale;
            const sy = ry * scale;
            // 4. translate back
            return { x: sx + centerX, y: sy + centerY };
        },
        [centerX, centerY, rotation, scale]
    );

    const toWorldCoords = useCallback(
        (clientX: number, clientY: number) => {
            const coords = toSvgCoords(clientX, clientY);
            if (!coords) return null;
            const x0 = coords.x - centerX;
            const y0 = coords.y - centerY;
            const invScale = scale === 0 ? 1 : 1 / scale;
            const x1 = x0 * invScale;
            const y1 = y0 * invScale;
            const rad = (rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const x2 = x1 * cos + y1 * sin;
            const y2 = -x1 * sin + y1 * cos;
            return { x: x2 + centerX, y: y2 + centerY };
        },
        [centerX, centerY, rotation, scale, toSvgCoords]
    );

    const centerView = useCallback((customBox?: { x: number; y: number; w: number; h: number }) => {
        if (customBox) {
            setViewBox(customBox);
        } else {
            setViewBox(initialViewBox);
        }
        setScale(1);
        setRotation(0);
    }, [initialViewBox]);

    const startPan = useCallback(
        (event: PointerEvent<Element>) => {
            const svg = svgRef.current;
            if (!svg) return;

            panPointerIdRef.current = event.pointerId;
            // In React types, setPointerCapture might be missing on some Element types, but SVGElement usually has it.
            // Casting to any or ElementWithCapture if needed, but usually works with SVGElement.
            (svg as Element).setPointerCapture?.(event.pointerId);

            panStartClientRef.current = { x: event.clientX, y: event.clientY };
            panStartViewBoxRef.current = { x: viewBox.x, y: viewBox.y };
            const rect = svg.getBoundingClientRect();
            panScaleRef.current = {
                x: viewBox.w / rect.width,
                y: viewBox.h / rect.height,
            };
            setIsPanning(true);
        },
        [svgRef, viewBox.x, viewBox.y, viewBox.w, viewBox.h]
    );

    const onPanMove = useCallback(
        (event: PointerEvent<Element>) => {
            if (
                panPointerIdRef.current !== null &&
                panStartClientRef.current &&
                panStartViewBoxRef.current &&
                panScaleRef.current
            ) {
                const start = panStartClientRef.current;
                const vb0 = panStartViewBoxRef.current;
                const scaleFactors = panScaleRef.current;
                const dx = event.clientX - start.x;
                const dy = event.clientY - start.y;
                setViewBox({
                    x: vb0.x - dx * scaleFactors.x,
                    y: vb0.y - dy * scaleFactors.y,
                    w: viewBox.w,
                    h: viewBox.h,
                });
                return true; // Handled
            }
            return false; // Not handled
        },
        [viewBox.w, viewBox.h]
    );

    const onPanEnd = useCallback(
        (event: PointerEvent<Element>) => {
            if (panPointerIdRef.current !== null) {
                const svg = svgRef.current;
                if (svg && svg.hasPointerCapture?.(panPointerIdRef.current)) {
                    svg.releasePointerCapture(panPointerIdRef.current);
                }
                panPointerIdRef.current = null;
                panStartClientRef.current = null;
                panStartViewBoxRef.current = null;
                panScaleRef.current = null;
                setIsPanning(false);
                return true;
            }
            return false;
        },
        [svgRef]
    );

    const handleWheel = useCallback(
        (event: WheelEvent<Element>) => {
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.1 : 0.9;
            setScale((prev) => Math.min(maxScale, Math.max(minScale, prev * factor)));
        },
        [maxScale, minScale]
    );

    return {
        viewBox,
        setViewBox,
        scale,
        setScale,
        rotation,
        setRotation,
        isPanning,
        transformGroup,
        centerX,
        centerY,
        transformPoint,
        toSvgCoords,
        toWorldCoords,
        centerView,
        startPan,
        onPanMove,
        onPanEnd,
        handleWheel,
    };
}
