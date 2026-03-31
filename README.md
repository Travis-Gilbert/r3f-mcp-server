# R3F Scene MCP Server

MCP server for managing React Three Fiber scenes. Generic 3D scene CRUD
with Theseus evidence visualization support.

## Tools

| Tool | Description |
|------|-------------|
| `r3f_list_scenes` | List all available scenes |
| `r3f_get_scene` | Get full scene graph by ID |
| `r3f_create_scene` | Create a new scene from scratch |
| `r3f_patch_scene` | Apply structured mutations (add/remove/update nodes, edges, camera) |
| `r3f_delete_scene` | Remove a scene |
| `r3f_create_from_evidence` | Generate scene from Theseus Response Protocol evidence path |

## Quick Start

```bash
npm install
npm run build
npm start
```

Server runs at `http://localhost:3000/mcp`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP port |
| `TRANSPORT` | http | Transport mode: `http` or `stdio` |
| `SCENES_DIR` | ./scenes | Directory for scene JSON files |

## Theseus Integration

The `r3f_create_from_evidence` tool takes Theseus Response Protocol
evidence path data and generates a 3D scene with:

- Node shapes mapped to object types (source=sphere, concept=torus, person=cylinder)
- Colors from the Theseus design system (teal, purple, terracotta, amber)
- Edge width proportional to connection strength
- Dashed edges for non-accepted connections
- Dark background matching the Theseus interface

## Deployment (Railway)

1. Create a new service in the Theseus Railway project
2. Point it at this repo
3. Set env vars: `PORT=3000`, `TRANSPORT=http`, `SCENES_DIR=/app/scenes`
4. Deploy
5. MCP endpoint: `https://<service-url>/mcp`

## Scene Format

Scenes are JSON files with this structure:

```json
{
  "id": "scene-id",
  "name": "Scene Name",
  "description": "What this scene shows",
  "camera": { "position": [0, 5, 15], "target": [0, 0, 0] },
  "nodes": [
    { "id": "n1", "type": "sphere", "position": [0, 0, 0], "color": "#2D5F6B", "label": "Node" }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "color": "#4A8A96" }
  ],
  "environment": { "background": "#0f1012", "ambientLight": 0.4 }
}
```

Node types: `sphere`, `box`, `cylinder`, `text`, `torus`, `plane`
