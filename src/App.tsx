import { useCallback, useState } from "react";
import {
    Background,
    BackgroundVariant,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type ConnectionLineComponentProps,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useGraph } from "./store/graph";
import { engine } from "./audio/engine";
import { ModuleBlock } from "./components/ModuleBlock";
import { CableEdge } from "./cables/CableEdge";
import { DRAG_TYPE, Palette } from "./components/Palette";

const nodeTypes = { module: ModuleBlock };
const edgeTypes = { cable: CableEdge };

/** Câble « en main » pendant le tirage : une courbe qui pend légèrement. */
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
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect, isValidConnection, addModule } = useGraph();
    const { screenToFlowPosition } = useReactFlow();
    const [started, setStarted] = useState(engine.isRunning);

    const addAtCenter = useCallback(
        (type: string) => {
            const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
            addModule(type, { x: position.x - 110, y: position.y - 80 });
        },
        [addModule, screenToFlowPosition],
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            const type = e.dataTransfer.getData(DRAG_TYPE);
            if (!type) return;
            e.preventDefault();
            const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            addModule(type, { x: position.x - 110, y: position.y - 30 });
        },
        [addModule, screenToFlowPosition],
    );

    return (
        <div className="app">
            <Palette onAdd={addAtCenter} />
            <main
                className="mat"
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                    }
                }}
                onDrop={onDrop}
            >
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    isValidConnection={isValidConnection}
                    connectionLineComponent={DraggingCable}
                    connectionRadius={40}
                    deleteKeyCode={["Backspace", "Delete"]}
                    fitView
                    fitViewOptions={{ padding: 0.25 }}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={28} size={3} color="var(--peg)" />
                </ReactFlow>

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
                            Lancer le son
                        </button>
                        <p>Le navigateur attend un clic avant de jouer de l'audio.</p>
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
