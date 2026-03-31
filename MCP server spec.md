
High-level design

Build a generic “R3F Scene MCP Server” that knows how to:

- Discover and manage R3F scenes (files or JSON in a repo).

- Let Claude read and patch those scenes via structured tools.

- Optionally render previews via an MCP App or screenshots.

Theseus becomes one consumer of this, but the server itself is project‑agnostic: it just knows “scenes,” “materials,” “lights,” etc.

1. Scene model and storage

Goal: Simple, generic representation that can map to any R3F project.

Scene identity

Each scene has:

- ‎⁠id⁠ (string, stable)

- ‎⁠name⁠ (string)

- ‎⁠description⁠ (string)

- ‎⁠kind⁠ (‎⁠"tsx"⁠ | ‎⁠"json"⁠)

- ‎⁠path⁠ (filesystem path) or ‎⁠uri⁠ (if remote)

Scene content strategies

You support both:

1. TSX scenes (idiomatic R3F components)

 ▫ Example: ‎⁠src/scenes/TheseusAnswerScene.tsx⁠

 ▫ Exported as a function component that renders R3F JSX.

2. JSON scenes (abstract scene graph)

 ▫ Example file: ‎⁠src/scenes/theseus\_answer.json⁠

{

  "id": "theseus-answer",

  "camera": {

	"position": [0, 0, 10],
	
	"target": [0, 0, 0]

  },

  "nodes": [

	{
	
	  "id": "question",
	
	  "type": "sphere",
	
	  "position": [-3, 0, 0],
	
	  "color": "#f97316",
	
	  "label": "Question"
	
	},
	
	{
	
	  "id": "engine",
	
	  "type": "box",
	
	  "position": [0, 0, 0],
	
	  "color": "#2563eb",
	
	  "label": "Engine"
	
	}

  ],

  "edges": [

	{
	
	  "from": "question",
	
	  "to": "engine",
	
	  "color": "#e5e7eb"
	
	}

  ]

}

Your app has a generic ‎⁠SceneRenderer⁠ that turns this into ‎⁠<Canvas>⁠ JSX.

The MCP server doesn’t need to run React; it just reads/writes TSX or JSON files.

2. MCP server responsibilities

Implement a Node/TS server using the MCP SDK that exposes tools under a namespace like ‎⁠r3f/\*⁠.

Core tools (generic, non‑Theseus-specific)

1. ‎⁠r3f/list\_scenes⁠

 ▫ Input: none

 ▫ Output:{

  "scenes": [

	{
	
	  "id": "theseus-answer",
	
	  "name": "Theseus Answer Flow",
	
	  "kind": "json",
	
	  "path": "src/scenes/theseus_answer.json",
	
	  "description": "Visualize how a knowledge engine answers a question."
	
	}

  ]

}

2. ‎⁠r3f/get\_scene⁠

 ▫ Input:{ "id": "theseus-answer" }

 ▫ Output (for TSX):{

  "id": "theseus-answer",

  "kind": "tsx",

  "path": "src/scenes/TheseusAnswerScene.tsx",

  "source": "import { Canvas } from '@react-three/fiber';n..."

}

 ▫ Or (for JSON):{

  "id": "theseus-answer",

  "kind": "json",

  "path": "src/scenes/theseus\_answer.json",

  "scene": { /\* JSON graph as above \*/ }

}

3. ‎⁠r3f/propose\_patch⁠This is the key “safe mutation” tool.

 ▫ Input:{

  "id": "theseus-answer",

  "kind": "json",

  "patch": {

	"addNodes": [
	
	  {
	
	    "id": "retrieval",
	
	    "type": "box",
	
	    "position": [3, 0, 0],
	
	    "color": "#22c55e",
	
	    "label": "Retrieval"
	
	  }
	
	],
	
	"addEdges": [
	
	  {
	
	    "from": "engine",
	
	    "to": "retrieval",
	
	    "color": "#a3e635"
	
	  }
	
	]

  }

}

 ▫ Output:{

  "id": "theseus-answer",

  "status": "ok",

  "path": "src/scenes/theseus\_answer.json",

  "previewId": "preview-abc123"

}

For TSX scenes, use a simpler contract at first:

 ▫ Input: ‎⁠id⁠, ‎⁠path⁠, ‎⁠currentSource⁠, ‎⁠instructions⁠ (natural language).

 ▫ Server uses a diff/patch library (or a simple overwrite) and returns updated ‎⁠source⁠, writing to disk.

4. ‎⁠r3f/get\_preview⁠

 ▫ Input:{ "previewId": "preview-abc123" }

 ▫ Output:{

  "previewId": "preview-abc123",

  "imageResourceId": "resource://r3f/preview/abc123.png"

}

The server can generate that PNG via Playwright/Puppeteer hitting a local ‎⁠/r3f-preview/:id⁠ endpoint in your Next app.

3. MCP App (optional but very powerful)

To get an interactive 3D canvas inside Claude, you add an MCP App:

- A small web app (React + R3F) that:

 ▫ Connects to the MCP server via postMessage (per MCP Apps spec).

 ▫ Exposes a ‎⁠ui://r3f/inspector⁠ resource.

 ▫ Renders a ‎⁠<Canvas>⁠ that loads a scene by ‎⁠sceneId⁠.

 ▫ Displays basic inspector UI (node list, selection, properties).

Tool that declares the app:

- ‎⁠r3f/open\_inspector⁠

 ▫ Input:{ "id": "theseus-answer" }

 ▫ Tool description includes:"\_meta": {

  "ui": {

	"resourceUri": "ui://r3f/inspector"

  }

}

Claude can then open that app for you when it wants to “show the scene,” and you see a live, manipulable R3F visualization while it edits the underlying scene via other tools.

4. File layout and configuration

Assume a monorepo or a single Next app:

- ‎⁠apps/web/⁠ – your Next.js + R3F site.

- ‎⁠packages/r3f-mcp-server/⁠ – MCP server.

- ‎⁠packages/r3f-preview-app/⁠ – optional MCP App (React + R3F).

Inside ‎⁠packages/r3f-mcp-server⁠:

- ‎⁠src/config.ts⁠ – where scenes live, e.g.:export const scenesRoot = "apps/web/src/scenes";

export const scenesConfig = [

  {

	id: "theseus-answer",
	
	name: "Theseus Answer Flow",
	
	kind: "json",
	
	path: "apps/web/src/scenes/theseus_answer.json",
	
	description: "Visualizes an AI pipeline answering a question."

  }

];

- ‎⁠src/server.ts⁠ – MCP server entrypoint:

 ▫ Registers tools.

 ▫ Implements file I/O and preview pipeline.

5. Guardrails and best practices

To keep it general yet safe:

- Namespace rules

 ▫ Only touch files under ‎⁠scenesRoot⁠.

 ▫ Refuse operations outside configured paths.

- TSX safety

 ▫ Run Prettier + ESLint on updated files.

 ▫ Optionally restrict changes to inside ‎⁠<Canvas>⁠ subtree or inside a specific exported component.

- JSON schema

 ▫ Validate every patch against a JSON Schema (e.g. ‎⁠node.type⁠ must be enum of known primitives, ‎⁠position⁠ is ‎⁠[number, number, number]⁠, etc.).

 ▫ Reject invalid patches with clear errors.

- Preview cost control

 ▫ Cache previews by ‎⁠sceneId⁠ + hash of content to avoid rerendering for identical scenes.

 ▫ Limit max preview frequency per minute.

6. How this stays reusable beyond Theseus

Nothing in the spec mentions Theseus specifically:

- Scene IDs and descriptions are arbitrary.

- Node types (‎⁠box⁠, ‎⁠sphere⁠, ‎⁠text⁠, ‎⁠line⁠) are generic.

- The server just exposes “R3F scene as TSX or JSON” and lets Claude mutate them.

For Theseus you’ll simply:

- Add a ‎⁠theseus-answer⁠ scene and a renderer that understands “pass”, “object”, “edge” as domain concepts layered on top of the generic node/edge primitives.

- Later, you can add other scenes (e.g. “city morphologies,” “parcel flows,” “project timelines”) without touching the MCP server core.

If you’d like, I can turn this into concrete TypeScript interfaces for the tool schemas and a skeleton ‎⁠server.ts⁠ showing how to wire up ‎⁠list\_scenes⁠, ‎⁠get\_scene⁠, and ‎⁠propose\_patch⁠.