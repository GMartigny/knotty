import { useCallback, useEffect, useRef, useState } from "react";
import {
    Background,
    BackgroundVariant,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type ConnectionLineComponentProps,
    type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useGraph } from "./store/graph";
import { engine } from "./audio/engine";
import { ModuleBlock } from "./components/ModuleBlock";
import { CableEdge } from "./cables/CableEdge";
import { Palette } from "./components/Palette";
import { ClearButton } from "./components/ClearButton";
import { EmptyMat } from "./components/EmptyMat";
import { isTextField } from "./lib/dom";

const nodeTypes = { module: ModuleBlock };
const edgeTypes = { cable: CableEdge };

/**
 * Keyboard shortcuts on the patch (Cmd on a Mac): Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes,
 * Ctrl+A selects every block, Ctrl+C copies the selected blocks, Ctrl+V pastes them at the pointer
 * (`pointer()`, in flow coordinates).
 */
function usePatchShortcuts(pointer: () => XYPosition | undefined) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // In a text field, its own undo and copy apply, not the patch's.
            if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return;
            const graph = useGraph.getState();
            const key = e.key.toLowerCase();
            if (key === "z" && !e.shiftKey) graph.undo();
            else if ((key === "z" && e.shiftKey) || key === "y") graph.redo();
            else if (key === "a" && !e.shiftKey) graph.selectAll();
            else if (key === "c" && !e.shiftKey) {
                // Nothing selected: leave the browser's own copy alone (selected text…).
                if (!graph.copy()) return;
            } else if (key === "v" && !e.shiftKey) graph.paste(pointer());
            else return;
            e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [pointer]);
}

/** Cable "in hand" while pulling: a slightly sagging curve. */
function DraggingCable({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
    const sag = Math.min(80, Math.hypot(toX - fromX, toY - fromY) * 0.25);
    const d = `M ${fromX} ${fromY} Q ${(fromX + toX) / 2} ${(fromY + toY) / 2 + sag} ${toX} ${toY}`;
    return (
        <g className="cable is-dragging">
            <path className="cable-shadow" d={d} fill="none" />
            <path className="cable-main" d={d} fill="none" />
        </g>
    );
}

function Workbench() {
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect, isValidConnection, addModule, startGrab, endGrab, removeNode, grab } =
        useGraph();
    // Kind of the pulled socket (e.g. "out-audio"): the stylesheet lights up compatible sockets.
    const grabbing = grab?.kind ? `${grab.side === "source" ? "out" : "in"}-${grab.kind}` : undefined;
    const { screenToFlowPosition } = useReactFlow();
    const [started, setStarted] = useState(engine.isRunning);
    const mat = useRef<HTMLElement>(null);
    // Last pointer position over the mat, where Ctrl+V pastes.
    const lastPointer = useRef<{ x: number; y: number } | null>(null);
    const pointer = useCallback(
        () => (lastPointer.current ? screenToFlowPosition(lastPointer.current) : undefined),
        [screenToFlowPosition],
    );
    usePatchShortcuts(pointer);

    const addAtCenter = useCallback(
        (type: string) => {
            const r = mat.current?.getBoundingClientRect();
            const center = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const position = screenToFlowPosition(center);
            addModule(type, { x: position.x - 110, y: position.y - 80 });
        },
        [addModule, screenToFlowPosition],
    );

    /** Block dropped from the palette: added where it lands, if it lands on the mat. */
    const onDrop = useCallback(
        (type: string, clientX: number, clientY: number) => {
            const r = mat.current?.getBoundingClientRect();
            if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
            const position = screenToFlowPosition({ x: clientX, y: clientY });
            addModule(type, { x: position.x - 110, y: position.y - 30 });
            return true;
        },
        [addModule, screenToFlowPosition],
    );

    return (
        <div className="app">
            <Palette onAdd={addAtCenter} onDrop={onDrop} />
            <main
                ref={mat}
                className="mat"
                data-grab={grabbing}
                onPointerMove={(e) => (lastPointer.current = { x: e.clientX, y: e.clientY })}
                onPointerLeave={() => (lastPointer.current = null)}
            >
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onConnectStart={(_, { nodeId, handleId, handleType }) => {
                        if (nodeId && handleId && handleType) startGrab({ nodeId, handleId, side: handleType });
                    }}
                    onConnectEnd={(_, connection) => endGrab(!connection.toHandle)}
                    isValidConnection={isValidConnection}
                    connectionLineComponent={DraggingCable}
                    connectionRadius={40}
                    // A selected Comment stays behind the blocks.
                    elevateNodesOnSelect={false}
                    deleteKeyCode={["Backspace", "Delete"]}
                    onBeforeDelete={async ({ nodes: deletedNodes, edges: deletedEdges }) => {
                        // Keyboard deletion: blocks fall (and their cables with them);
                        // cables selected on their own disappear right away.
                        deletedNodes.forEach((n) => removeNode(n.id));
                        const nodeIds = new Set(deletedNodes.map((n) => n.id));
                        const lone = deletedEdges.filter((e) => !nodeIds.has(e.source) && !nodeIds.has(e.target));
                        if (lone.length) onEdgesChange(lone.map((e) => ({ type: "remove", id: e.id })));
                        return false;
                    }}
                    fitView
                    fitViewOptions={{ padding: 0.1 }}
                    minZoom={0.2}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={28} size={3} color="var(--peg)" />
                </ReactFlow>

                <ClearButton />
                <EmptyMat />

                {!started && (
                    <div className="start">
                        <button
                            type="button"
                            className="start-button"
                            onClick={async () => {
                                await engine.start();
                                setStarted(true);
                            }}
                        >
                            Start the sound
                        </button>
                        <p>The browser needs a click before it can play audio.</p>
                    </div>
                )}
            </main>
        </div>
    );
}

export default function App() {
    return (
        <ReactFlowProvider>
            <Workbench />
        </ReactFlowProvider>
    );
}
