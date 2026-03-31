/**
 * Theseus evidence scene generator.
 *
 * Converts Response Protocol evidence paths into
 * R3F scene graphs. Maps object types to node shapes
 * and colors matching the Theseus design system.
 */
import type {
  SceneGraph,
  SceneNode,
  SceneEdge,
  TheseusEvidenceInput,
} from "../types.js";
import { saveScene } from "./scene-store.js";

/** Theseus design tokens */
const TYPE_COLORS: Record<string, string> = {
  note: "#e8e5e0",
  source: "#2D5F6B",
  concept: "#7B5EA7",
  person: "#C4503C",
  hunch: "#C49A4A",
  event: "#4A8A96",
  task: "#D4B06A",
};

const TYPE_SHAPES: Record<string, SceneNode["type"]> = {
  note: "box",
  source: "sphere",
  concept: "torus",
  person: "cylinder",
  hunch: "box",
  event: "box",
  task: "box",
};

const ROLE_SCALE: Record<string, number> = {
  premise: 1.0,
  bridge: 0.7,
  conclusion: 1.2,
};

/** Compute force-directed layout positions for nodes */
function layoutNodes(
  count: number,
  spacing: number = 4
): Array<[number, number, number]> {
  if (count === 0) return [];
  if (count === 1) return [[0, 0, 0]];

  // Arrange in a horizontal arc
  const positions: Array<[number, number, number]> = [];
  const totalWidth = (count - 1) * spacing;
  const startX = -totalWidth / 2;

  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    // Slight vertical wave for visual interest
    const y = Math.sin((i / (count - 1)) * Math.PI) * 1.5;
    positions.push([x, y, 0]);
  }

  return positions;
}

/** Strength to edge color (teal spectrum) */
function strengthToColor(strength: number): string {
  if (strength >= 0.8) return "#4A8A96";
  if (strength >= 0.6) return "#2D5F6B";
  if (strength >= 0.4) return "#5c5851";
  return "#3a3832";
}

/**
 * Generate a scene from Theseus evidence path data.
 *
 * Takes the evidence_path section from a Response Protocol
 * response and creates a 3D scene graph.
 */
export function createEvidenceScene(
  input: TheseusEvidenceInput
): SceneGraph {
  const positions = layoutNodes(input.nodes.length);
  const idMap = new Map<number, string>();

  // Build nodes
  const sceneNodes: SceneNode[] = input.nodes.map((node, i) => {
    const nodeId = `obj-${node.object_id}`;
    idMap.set(node.object_id, nodeId);

    return {
      id: nodeId,
      type: TYPE_SHAPES[node.type] || "sphere",
      position: positions[i] || [0, 0, 0],
      color: TYPE_COLORS[node.type] || "#9a958d",
      label: node.title,
      scale: ROLE_SCALE[node.role] || 1.0,
      domain: {
        object_id: node.object_id,
        object_type: node.type,
        role: node.role,
      },
    };
  });

  // Build edges
  const sceneEdges: SceneEdge[] = input.edges
    .filter((e) => idMap.has(e.from) && idMap.has(e.to))
    .map((edge) => ({
      from: idMap.get(edge.from)!,
      to: idMap.get(edge.to)!,
      color: strengthToColor(edge.strength),
      width: 1 + edge.strength * 2,
      dashed: edge.acceptance_status !== "accepted",
      domain: {
        signal: edge.signal,
        strength: edge.strength,
        acceptance_status: edge.acceptance_status,
      },
    }));

  // Camera: position based on scene width
  const maxX = Math.max(...positions.map((p) => Math.abs(p[0])), 5);
  const cameraZ = maxX * 1.8;

  const sceneId = `theseus-evidence-${Date.now()}`;

  const scene: SceneGraph = {
    id: sceneId,
    name: `Evidence: ${input.query.slice(0, 60)}`,
    description: `Evidence path visualization for: "${input.query}"`,
    camera: {
      position: [0, 3, cameraZ],
      target: [0, 0, 0],
      fov: 50,
    },
    nodes: sceneNodes,
    edges: sceneEdges,
    environment: {
      background: "#0f1012",
      ambientLight: 0.4,
      gridVisible: true,
    },
  };

  saveScene(scene);
  return scene;
}
