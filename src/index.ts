/**
 * R3F Scene MCP Server
 *
 * Generic 3D scene management via MCP tools.
 * Includes Theseus-specific evidence visualization.
 *
 * Tools:
 *   r3f_list_scenes          List all available scenes
 *   r3f_get_scene            Get a scene by ID (full JSON graph)
 *   r3f_create_scene         Create a new scene from scratch
 *   r3f_patch_scene          Apply structured mutations to a scene
 *   r3f_delete_scene         Remove a scene
 *   r3f_create_from_evidence (Theseus) Generate scene from evidence path
 *   r3f_evaluate_scene       Run design heuristics on a scene
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  StreamableHTTPServerTransport,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { z } from "zod";

import {
  listScenes,
  getScene,
  saveScene,
  deleteScene,
  applyPatch,
} from "./services/scene-store.js";
import { createEvidenceScene } from "./services/theseus-scenes.js";
import { evaluateScene } from "./services/design-evaluator.js";
import type { SceneGraph } from "./types.js";

// ── Server ──

const server = new McpServer({
  name: "r3f-mcp-server",
  version: "1.1.0",
});

// ── Tool: r3f_list_scenes ──

server.registerTool(
  "r3f_list_scenes",
  {
    title: "List R3F Scenes",
    description: `List all available 3D scenes managed by this server.

Returns an array of scene metadata (id, name, kind, description).
Does not return full scene content. Use r3f_get_scene for that.

Returns:
  { scenes: [{ id, name, kind, path, description }] }`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const scenes = listScenes();
    const output = { scenes };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output as unknown as Record<string, unknown>,
    };
  }
);

// ── Tool: r3f_get_scene ──

const GetSceneSchema = z.object({
  id: z.string().describe("Scene ID to retrieve"),
}).strict();

server.registerTool(
  "r3f_get_scene",
  {
    title: "Get R3F Scene",
    description: `Get the full scene graph for a scene by ID.

Returns the complete JSON scene with nodes, edges, camera, and environment.

Args:
  id (string): The scene ID

Returns:
  Full SceneGraph JSON with nodes, edges, camera config.
  Returns error if scene not found.`,
    inputSchema: GetSceneSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ id }: z.infer<typeof GetSceneSchema>) => {
    const scene = getScene(id);
    if (!scene) {
      return {
        content: [{ type: "text", text: `Error: Scene "${id}" not found` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(scene, null, 2) }],
      structuredContent: scene as unknown as Record<string, unknown>,
    };
  }
);

// ── Tool: r3f_create_scene ──

const CreateSceneSchema = z.object({
  id: z.string()
    .min(1).max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "ID must be alphanumeric with hyphens/underscores")
    .describe("Unique scene identifier"),
  name: z.string().min(1).max(200).describe("Human-readable scene name"),
  description: z.string().max(500).default("").describe("Scene description"),
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum(["sphere", "box", "cylinder", "text", "torus", "plane"]),
    position: z.tuple([z.number(), z.number(), z.number()]),
    color: z.string(),
    label: z.string().optional(),
    scale: z.number().optional(),
    domain: z.record(z.unknown()).optional(),
  })).default([]).describe("Scene nodes"),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    color: z.string(),
    width: z.number().optional(),
    dashed: z.boolean().optional(),
    label: z.string().optional(),
  })).default([]).describe("Scene edges"),
  camera: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    target: z.tuple([z.number(), z.number(), z.number()]),
    fov: z.number().optional(),
  }).optional().describe("Camera configuration"),
  background: z.string().optional().describe("Background color"),
}).strict();

server.registerTool(
  "r3f_create_scene",
  {
    title: "Create R3F Scene",
    description: `Create a new 3D scene from scratch.

Provide an ID, name, and optionally nodes, edges, camera config.
The scene is saved to disk and can be retrieved or patched later.

Args:
  id (string): Unique scene identifier (alphanumeric, hyphens, underscores)
  name (string): Human-readable name
  description (string): Optional description
  nodes (array): Scene nodes with id, type, position, color
  edges (array): Scene edges with from, to, color
  camera (object): Optional camera position and target
  background (string): Optional background color

Returns:
  The created scene with its file path.`,
    inputSchema: CreateSceneSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params: z.infer<typeof CreateSceneSchema>) => {
    // Check if scene already exists
    const existing = getScene(params.id);
    if (existing) {
      return {
        content: [{
          type: "text",
          text: `Error: Scene "${params.id}" already exists. Use r3f_patch_scene to modify it.`,
        }],
        isError: true,
      };
    }

    const scene: SceneGraph = {
      id: params.id,
      name: params.name,
      description: params.description || "",
      camera: params.camera || {
        position: [0, 5, 15],
        target: [0, 0, 0],
      },
      nodes: params.nodes as SceneGraph["nodes"],
      edges: params.edges as SceneGraph["edges"],
      environment: {
        background: params.background || "#0f1012",
        ambientLight: 0.4,
        gridVisible: true,
      },
    };

    const { path } = saveScene(scene);
    const output = { id: scene.id, name: scene.name, path, status: "created" };

    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output as unknown as Record<string, unknown>,
    };
  }
);

// ── Tool: r3f_patch_scene ──

const PatchSceneSchema = z.object({
  id: z.string().describe("Scene ID to patch"),
  patch: z.object({
    addNodes: z.array(z.object({
      id: z.string(),
      type: z.enum(["sphere", "box", "cylinder", "text", "torus", "plane"]),
      position: z.tuple([z.number(), z.number(), z.number()]),
      color: z.string(),
      label: z.string().optional(),
      scale: z.number().optional(),
      domain: z.record(z.unknown()).optional(),
    })).optional(),
    removeNodes: z.array(z.string()).optional(),
    updateNodes: z.array(z.object({
      id: z.string(),
      position: z.tuple([z.number(), z.number(), z.number()]).optional(),
      color: z.string().optional(),
      label: z.string().optional(),
      scale: z.number().optional(),
    })).optional(),
    addEdges: z.array(z.object({
      from: z.string(),
      to: z.string(),
      color: z.string(),
      width: z.number().optional(),
      dashed: z.boolean().optional(),
    })).optional(),
    removeEdges: z.array(z.object({
      from: z.string(),
      to: z.string(),
    })).optional(),
    updateCamera: z.object({
      position: z.tuple([z.number(), z.number(), z.number()]).optional(),
      target: z.tuple([z.number(), z.number(), z.number()]).optional(),
      fov: z.number().optional(),
    }).optional(),
  }).describe("Structured patch to apply"),
}).strict();

server.registerTool(
  "r3f_patch_scene",
  {
    title: "Patch R3F Scene",
    description: `Apply structured mutations to an existing scene.

Supports adding/removing/updating nodes and edges, and updating camera.
Validates all changes before applying. Removing a node also removes its edges.

Args:
  id (string): Scene ID to modify
  patch (object): Structured patch with addNodes, removeNodes, updateNodes,
                  addEdges, removeEdges, updateCamera

Returns:
  List of changes applied and the updated scene summary.
  Returns error if scene not found or patch is invalid.`,
    inputSchema: PatchSceneSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ id, patch }: z.infer<typeof PatchSceneSchema>) => {
    try {
      const result = applyPatch(id, patch);
      const output = {
        id,
        status: "ok",
        changes: result.changes,
        nodeCount: result.scene.nodes.length,
        edgeCount: result.scene.edges.length,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: r3f_delete_scene ──

const DeleteSceneSchema = z.object({
  id: z.string().describe("Scene ID to delete"),
}).strict();

server.registerTool(
  "r3f_delete_scene",
  {
    title: "Delete R3F Scene",
    description: `Delete a scene by ID. This is permanent.

Args:
  id (string): Scene ID to delete

Returns:
  Confirmation of deletion or error if not found.`,
    inputSchema: DeleteSceneSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ id }: z.infer<typeof DeleteSceneSchema>) => {
    const deleted = deleteScene(id);
    if (!deleted) {
      return {
        content: [{ type: "text", text: `Error: Scene "${id}" not found` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `Scene "${id}" deleted.` }],
      structuredContent: { id, status: "deleted" },
    };
  }
);

// ── Tool: r3f_create_from_evidence (Theseus-specific) ──

const EvidenceSchema = z.object({
  query: z.string().describe("The question that produced this evidence path"),
  nodes: z.array(z.object({
    object_id: z.number(),
    type: z.string().describe("Object type: note, source, concept, person, hunch"),
    title: z.string(),
    role: z.enum(["premise", "bridge", "conclusion"]),
  })).min(1).describe("Evidence path nodes from Theseus Response Protocol"),
  edges: z.array(z.object({
    from: z.number().describe("Source object_id"),
    to: z.number().describe("Target object_id"),
    signal: z.string().describe("Signal type: bm25, sbert, entity_match, nli"),
    strength: z.number().min(0).max(1),
    acceptance_status: z.string().default("proposed"),
  })).default([]).describe("Evidence path edges"),
  confidence: z.object({
    evidence: z.number().min(0).max(100),
    tension: z.number().min(0).max(100),
  }).optional().describe("Confidence scores from the Response Protocol"),
}).strict();

server.registerTool(
  "r3f_create_from_evidence",
  {
    title: "Create Scene from Theseus Evidence",
    description: `Generate a 3D scene from a Theseus Response Protocol evidence path.

Converts evidence nodes and edges into a visual scene graph with:
- Node shapes mapped to Theseus object types (source=sphere, concept=torus, etc.)
- Node colors from the Theseus design system (teal, purple, terracotta, amber)
- Edge width proportional to connection strength
- Dashed edges for non-accepted connections
- Auto-computed camera position based on scene extent
- Dark background (#0f1012) matching the Theseus interface

This is the bridge between Theseus's reasoning pipeline and 3D visualization.

Args:
  query (string): The question that produced this evidence
  nodes (array): Evidence path nodes with object_id, type, title, role
  edges (array): Evidence path edges with from, to, signal, strength
  confidence (object): Optional evidence/tension confidence scores

Returns:
  The generated scene ID and full scene graph.`,
    inputSchema: EvidenceSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (params: z.infer<typeof EvidenceSchema>) => {
    try {
      const scene = createEvidenceScene(params);
      const output = {
        id: scene.id,
        name: scene.name,
        nodeCount: scene.nodes.length,
        edgeCount: scene.edges.length,
        status: "created",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: { ...output, scene } as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: r3f_evaluate_scene ──

const EvaluateSceneSchema = z.object({
  id: z.string().describe("Scene ID to evaluate"),
}).strict();

server.registerTool(
  "r3f_evaluate_scene",
  {
    title: "Evaluate Scene Design",
    description: `Run design heuristics on a scene and return actionable critique.

Checks five categories:
- Visual hierarchy: equal-weight detection, conclusion node dominance
- Spacing: minimum node distance, excessive spread
- Edge crossings: 2D projection intersection count
- Design tokens: Theseus color palette compliance
- Camera: framing relative to scene extent

Returns a score (0-100) and a list of findings, each with severity
(info/warning/error), category, message, suggestion, and affected
node IDs.

Use this after r3f_create_from_evidence or r3f_create_scene to check
whether the layout communicates the intended meaning clearly.

Args:
  id (string): Scene ID to evaluate

Returns:
  { scene_id, score, summary, findings: [...] }`,
    inputSchema: EvaluateSceneSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ id }: z.infer<typeof EvaluateSceneSchema>) => {
    const scene = getScene(id);
    if (!scene) {
      return {
        content: [{ type: "text", text: `Error: Scene "${id}" not found` }],
        isError: true,
      };
    }

    const result = evaluateScene(scene);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  }
);

// ── Transport ──

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "r3f-mcp-server", version: "1.1.0" });
  });

  // MCP endpoint (stateless, one transport per request)
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`R3F MCP Server running on http://localhost:${port}/mcp`);
    console.error(`Health check: http://localhost:${port}/health`);
    console.error(`Scenes directory: ${process.env.SCENES_DIR || "scenes/"}`);
  });
}

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("R3F MCP Server running on stdio");
}

// Choose transport based on environment
const transport = process.env.TRANSPORT || "http";
if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
