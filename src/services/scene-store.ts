/**
 * Scene storage service.
 *
 * Manages JSON scene files on disk. Validates patches
 * against the scene graph schema. Provides CRUD operations
 * that the MCP tools call.
 */
import * as fs from "fs";
import * as path from "path";
import type {
  SceneGraph,
  SceneConfig,
  ScenePatch,
  SceneNode,
} from "../types.js";

const SCENES_DIR = process.env.SCENES_DIR || path.join(process.cwd(), "scenes");

/** Ensure scenes directory exists */
function ensureDir(): void {
  if (!fs.existsSync(SCENES_DIR)) {
    fs.mkdirSync(SCENES_DIR, { recursive: true });
  }
}

/** Get the file path for a scene by ID */
function scenePath(id: string): string {
  // Sanitize: only allow alphanumeric, hyphens, underscores
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(SCENES_DIR, `${safe}.json`);
}

/** Validate that a path is within SCENES_DIR */
function validatePath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const root = path.resolve(SCENES_DIR);
  return resolved.startsWith(root);
}

/** List all scene configs from disk */
export function listScenes(): SceneConfig[] {
  ensureDir();
  const files = fs.readdirSync(SCENES_DIR).filter((f) => f.endsWith(".json"));

  return files.map((file) => {
    const filePath = path.join(SCENES_DIR, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const scene: SceneGraph = JSON.parse(raw);
      return {
        id: scene.id || path.basename(file, ".json"),
        name: scene.name || scene.id || file,
        kind: "json" as const,
        path: filePath,
        description: scene.description || "",
      };
    } catch {
      return {
        id: path.basename(file, ".json"),
        name: file,
        kind: "json" as const,
        path: filePath,
        description: "Failed to parse scene",
      };
    }
  });
}

/** Get a scene by ID */
export function getScene(id: string): SceneGraph | null {
  const filePath = scenePath(id);
  if (!validatePath(filePath) || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SceneGraph;
  } catch {
    return null;
  }
}

/** Create or overwrite a scene */
export function saveScene(scene: SceneGraph): { path: string } {
  ensureDir();
  const filePath = scenePath(scene.id);
  if (!validatePath(filePath)) {
    throw new Error("Invalid scene ID: path traversal detected");
  }

  fs.writeFileSync(filePath, JSON.stringify(scene, null, 2), "utf-8");
  return { path: filePath };
}

/** Delete a scene */
export function deleteScene(id: string): boolean {
  const filePath = scenePath(id);
  if (!validatePath(filePath) || !fs.existsSync(filePath)) {
    return false;
  }
  fs.unlinkSync(filePath);
  return true;
}

/** Validate a node has required fields */
function validateNode(node: Partial<SceneNode>): string | null {
  if (!node.id) return "Node missing id";
  if (!node.type) return "Node missing type";
  if (!node.position || !Array.isArray(node.position) || node.position.length !== 3) {
    return `Node ${node.id}: position must be [x, y, z]`;
  }
  if (!node.color) return `Node ${node.id}: missing color`;

  const validTypes = ["sphere", "box", "cylinder", "text", "torus", "plane"];
  if (!validTypes.includes(node.type)) {
    return `Node ${node.id}: invalid type "${node.type}". Valid: ${validTypes.join(", ")}`;
  }
  return null;
}

/** Apply a patch to a scene and save */
export function applyPatch(
  id: string,
  patch: ScenePatch
): { scene: SceneGraph; changes: string[] } {
  const scene = getScene(id);
  if (!scene) {
    throw new Error(`Scene "${id}" not found`);
  }

  const changes: string[] = [];

  // Add nodes
  if (patch.addNodes) {
    for (const node of patch.addNodes) {
      const err = validateNode(node);
      if (err) throw new Error(err);

      // Check for duplicate ID
      if (scene.nodes.some((n) => n.id === node.id)) {
        throw new Error(`Node "${node.id}" already exists in scene`);
      }
      scene.nodes.push(node);
      changes.push(`Added node "${node.id}" (${node.type})`);
    }
  }

  // Remove nodes (also removes connected edges)
  if (patch.removeNodes) {
    for (const nodeId of patch.removeNodes) {
      const idx = scene.nodes.findIndex((n) => n.id === nodeId);
      if (idx === -1) {
        throw new Error(`Node "${nodeId}" not found for removal`);
      }
      scene.nodes.splice(idx, 1);
      // Remove edges connected to this node
      const before = scene.edges.length;
      scene.edges = scene.edges.filter(
        (e) => e.from !== nodeId && e.to !== nodeId
      );
      const removed = before - scene.edges.length;
      changes.push(
        `Removed node "${nodeId}" and ${removed} connected edge(s)`
      );
    }
  }

  // Update nodes
  if (patch.updateNodes) {
    for (const update of patch.updateNodes) {
      const node = scene.nodes.find((n) => n.id === update.id);
      if (!node) {
        throw new Error(`Node "${update.id}" not found for update`);
      }
      Object.assign(node, update);
      changes.push(`Updated node "${update.id}"`);
    }
  }

  // Add edges
  if (patch.addEdges) {
    for (const edge of patch.addEdges) {
      if (!scene.nodes.some((n) => n.id === edge.from)) {
        throw new Error(`Edge source "${edge.from}" not found in scene`);
      }
      if (!scene.nodes.some((n) => n.id === edge.to)) {
        throw new Error(`Edge target "${edge.to}" not found in scene`);
      }
      scene.edges.push(edge);
      changes.push(`Added edge ${edge.from} -> ${edge.to}`);
    }
  }

  // Remove edges
  if (patch.removeEdges) {
    for (const rem of patch.removeEdges) {
      const idx = scene.edges.findIndex(
        (e) => e.from === rem.from && e.to === rem.to
      );
      if (idx !== -1) {
        scene.edges.splice(idx, 1);
        changes.push(`Removed edge ${rem.from} -> ${rem.to}`);
      }
    }
  }

  // Update camera
  if (patch.updateCamera) {
    Object.assign(scene.camera, patch.updateCamera);
    changes.push("Updated camera");
  }

  saveScene(scene);
  return { scene, changes };
}
