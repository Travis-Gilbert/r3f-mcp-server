/**
 * R3F Scene MCP Server type definitions.
 *
 * Generic scene graph types that can represent any 3D scene.
 * Theseus-specific concepts (evidence paths, objects) layer
 * on top via the domain field on nodes.
 */

export interface SceneNode {
  id: string;
  type: "sphere" | "box" | "cylinder" | "text" | "torus" | "plane";
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  color: string;
  label?: string;
  opacity?: number;
  /** Domain-specific metadata (e.g. object_type, score for Theseus) */
  domain?: Record<string, unknown>;
}

export interface SceneEdge {
  from: string;
  to: string;
  color: string;
  width?: number;
  dashed?: boolean;
  label?: string;
  domain?: Record<string, unknown>;
}

export interface SceneCamera {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface SceneGraph {
  id: string;
  name: string;
  description: string;
  camera: SceneCamera;
  nodes: SceneNode[];
  edges: SceneEdge[];
  environment?: {
    background?: string;
    ambientLight?: number;
    gridVisible?: boolean;
  };
}

export interface SceneConfig {
  id: string;
  name: string;
  kind: "json" | "tsx";
  path: string;
  description: string;
}

export interface ScenePatch {
  addNodes?: SceneNode[];
  removeNodes?: string[];
  updateNodes?: Array<{ id: string } & Partial<SceneNode>>;
  addEdges?: SceneEdge[];
  removeEdges?: Array<{ from: string; to: string }>;
  updateCamera?: Partial<SceneCamera>;
}

/** Theseus evidence path node (from Response Protocol) */
export interface EvidencePathNode {
  object_id: number;
  type: string;
  title: string;
  role: "premise" | "bridge" | "conclusion";
}

/** Theseus evidence path edge (from Response Protocol) */
export interface EvidencePathEdge {
  from: number;
  to: number;
  signal: string;
  strength: number;
  acceptance_status: string;
}

/** Input for creating a scene from Theseus evidence data */
export interface TheseusEvidenceInput {
  query: string;
  nodes: EvidencePathNode[];
  edges: EvidencePathEdge[];
  confidence?: { evidence: number; tension: number };
}
