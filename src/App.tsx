import { useCallback, useRef, useState } from "react";
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
import { Palette } from "./components/Palette";
import { ClearButton } from "./components/ClearButton";
import { EmptyMat } from "./components/EmptyMat";

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
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect, isValidConnection, addModule, startGrab, endGrab, removeNode, grab } =
        useGraph();
    // Type de la prise tirée (ex. "out-audio") : la feuille de style allume les prises compatibles.
    const grabbing = grab?.kind ? `${grab.side === "source" ? "out" : "in"}-${grab.kind}` : undefined;
    const { screenToFlowPosition } = useReactFlow();
    const [started, setStarted] = useState(engine.isRunning);

    const mat = useRef<HTMLElement>(null);

    const addAtCenter = useCallback(
        (type: string) => {
            const r = mat.current?.getBoundingClientRect();
            const center = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const position = screenToFlowPosition(center);
            addModule(type, { x: position.x - 110, y: position.y - 80 });
        },
        [addModule, screenToFlowPosition],
    );

    /** Bloc lâché depuis la palette : ajouté là où il tombe, s'il tombe sur le tapis. */
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
            <main ref={mat} className="mat" data-grab={grabbing}>
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
                    deleteKeyCode={["Backspace", "Delete"]}
                    onBeforeDelete={async ({ nodes: deletedNodes, edges: deletedEdges }) => {
                        // Suppression au clavier : les blocs tombent (et leurs câbles avec eux) ;
                        // les câbles sélectionnés seuls disparaissent tout de suite.
                        deletedNodes.forEach((n) => removeNode(n.id));
                        const nodeIds = new Set(deletedNodes.map((n) => n.id));
                        const lone = deletedEdges.filter((e) => !nodeIds.has(e.source) && !nodeIds.has(e.target));
                        if (lone.length) onEdgesChange(lone.map((e) => ({ type: "remove", id: e.id })));
                        return false;
                    }}
                    fitView
                    fitViewOptions={{ padding: 0.15 }}
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
