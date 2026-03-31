/**
 * Design evaluator for R3F scenes.
 *
 * Runs layout and visual hierarchy heuristics against a scene
 * graph and returns actionable critique. Applies design principles
 * programmatically: visual weight, spacing, readability, Theseus
 * design token compliance.
 */
import type { SceneGraph, SceneNode, SceneEdge } from "../types.js";

/** Theseus design system tokens for compliance checks */
const THESEUS_COLORS: Record<string, string> = {
  note: "#e8e5e0",
  source: "#2D5F6B",
  concept: "#7B5EA7",
  person: "#C4503C",
  hunch: "#C49A4A",
  event: "#4A8A96",
  task: "#D4B06A",
};

interface Finding {
  severity: "info" | "warning" | "error";
  category: string;
  message: string;
  suggestion: string;
  nodes?: string[];
}

interface EvaluationResult {
  scene_id: string;
  score: number;
  findings: Finding[];
  summary: string;
}

/** Euclidean distance between two 3D positions */
function dist(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

/** Get the effective scale of a node as a single number */
function nodeScale(node: SceneNode): number {
  if (!node.scale) return 1.0;
  if (typeof node.scale === "number") return node.scale;
  return (node.scale[0] + node.scale[1] + node.scale[2]) / 3;
}

/**
 * Check for equal-weight-everything (design smell).
 * If all nodes have the same scale, visual hierarchy is flat.
 */
function checkVisualHierarchy(scene: SceneGraph): Finding[] {
  const findings: Finding[] = [];
  if (scene.nodes.length < 2) return findings;

  const scales = scene.nodes.map(nodeScale);
  const uniqueScales = new Set(scales.map((s) => s.toFixed(2)));

  if (uniqueScales.size === 1 && scene.nodes.length >= 3) {
    findings.push({
      severity: "warning",
      category: "visual_hierarchy",
      message: `All ${scene.nodes.length} nodes have identical scale (${scales[0].toFixed(1)}). No visual hierarchy.`,
      suggestion:
        "Make the conclusion or primary node larger (1.2x) and bridge nodes smaller (0.7x) to create a clear reading order.",
      nodes: scene.nodes.map((n) => n.id),
    });
  }

  // Check if conclusion nodes exist but are not visually dominant
  const conclusionNodes = scene.nodes.filter(
    (n) => n.domain?.role === "conclusion"
  );
  const premiseNodes = scene.nodes.filter(
    (n) => n.domain?.role === "premise"
  );

  for (const cn of conclusionNodes) {
    const cnScale = nodeScale(cn);
    const dominated = premiseNodes.filter((p) => nodeScale(p) >= cnScale);
    if (dominated.length > 0) {
      findings.push({
        severity: "warning",
        category: "visual_hierarchy",
        message: `Conclusion node "${cn.label || cn.id}" is not visually dominant. ${dominated.length} premise node(s) are equal or larger.`,
        suggestion:
          "Scale the conclusion node to at least 1.2x to signal it as the endpoint of the evidence path.",
        nodes: [cn.id, ...dominated.map((d) => d.id)],
      });
    }
  }

  return findings;
}

/**
 * Check node spacing and readability.
 * Nodes too close together create visual clutter.
 */
function checkSpacing(scene: SceneGraph): Finding[] {
  const findings: Finding[] = [];
  if (scene.nodes.length < 2) return findings;

  const MIN_SPACING = 2.0;
  const tooClose: Array<[string, string, number]> = [];

  for (let i = 0; i < scene.nodes.length; i++) {
    for (let j = i + 1; j < scene.nodes.length; j++) {
      const d = dist(scene.nodes[i].position, scene.nodes[j].position);
      if (d < MIN_SPACING) {
        tooClose.push([scene.nodes[i].id, scene.nodes[j].id, d]);
      }
    }
  }

  if (tooClose.length > 0) {
    const worst = tooClose.sort((a, b) => a[2] - b[2])[0];
    findings.push({
      severity: "warning",
      category: "spacing",
      message: `${tooClose.length} node pair(s) are closer than ${MIN_SPACING} units. Closest: "${worst[0]}" and "${worst[1]}" at ${worst[2].toFixed(1)} units.`,
      suggestion: `Increase spacing to at least ${MIN_SPACING} units between nodes. Labels become unreadable when nodes overlap.`,
      nodes: [...new Set(tooClose.flatMap(([a, b]) => [a, b]))],
    });
  }

  // Check for extreme spread (nodes too far apart wastes viewport)
  const positions = scene.nodes.map((n) => n.position);
  const maxExtent = Math.max(
    ...positions.map((p) => Math.abs(p[0])),
    ...positions.map((p) => Math.abs(p[1])),
    ...positions.map((p) => Math.abs(p[2]))
  );

  if (maxExtent > 30 && scene.nodes.length < 10) {
    findings.push({
      severity: "info",
      category: "spacing",
      message: `Scene extends ${maxExtent.toFixed(0)} units but has only ${scene.nodes.length} nodes. Lots of empty space.`,
      suggestion:
        "Tighten the layout. Dense arrangements with clear spacing read better than sparse sprawl.",
    });
  }

  return findings;
}

/**
 * Check edge crossings (fewer is better for readability).
 */
function checkEdgeCrossings(scene: SceneGraph): Finding[] {
  const findings: Finding[] = [];
  if (scene.edges.length < 2) return findings;

  // Build position lookup
  const posMap = new Map<string, [number, number, number]>();
  for (const n of scene.nodes) {
    posMap.set(n.id, n.position);
  }

  // Simple 2D crossing check (project to XY plane)
  let crossings = 0;
  const edgePositions = scene.edges
    .map((e) => ({
      from: posMap.get(e.from),
      to: posMap.get(e.to),
    }))
    .filter((e) => e.from && e.to) as Array<{
    from: [number, number, number];
    to: [number, number, number];
  }>;

  for (let i = 0; i < edgePositions.length; i++) {
    for (let j = i + 1; j < edgePositions.length; j++) {
      if (
        segmentsIntersect2D(
          edgePositions[i].from,
          edgePositions[i].to,
          edgePositions[j].from,
          edgePositions[j].to
        )
      ) {
        crossings++;
      }
    }
  }

  if (crossings > 0) {
    findings.push({
      severity: crossings > 3 ? "warning" : "info",
      category: "edge_crossings",
      message: `${crossings} edge crossing(s) detected in XY projection.`,
      suggestion:
        "Reposition nodes to reduce crossings. Uncrossed layouts are significantly easier to trace visually.",
    });
  }

  return findings;
}

/** 2D line segment intersection test (XY projection) */
function segmentsIntersect2D(
  a1: [number, number, number],
  a2: [number, number, number],
  b1: [number, number, number],
  b2: [number, number, number]
): boolean {
  const d1x = a2[0] - a1[0], d1y = a2[1] - a1[1];
  const d2x = b2[0] - b1[0], d2y = b2[1] - b1[1];
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;

  const dx = b1[0] - a1[0], dy = b1[1] - a1[1];
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

/**
 * Check Theseus design token compliance.
 */
function checkDesignTokens(scene: SceneGraph): Finding[] {
  const findings: Finding[] = [];

  const knownColors = new Set(Object.values(THESEUS_COLORS));
  const offBrand: SceneNode[] = [];

  for (const node of scene.nodes) {
    const objectType = node.domain?.object_type as string | undefined;
    if (objectType && THESEUS_COLORS[objectType]) {
      if (node.color.toLowerCase() !== THESEUS_COLORS[objectType].toLowerCase()) {
        offBrand.push(node);
      }
    } else if (!knownColors.has(node.color.toLowerCase()) && !knownColors.has(node.color)) {
      // Not a known Theseus color at all
      offBrand.push(node);
    }
  }

  if (offBrand.length > 0) {
    findings.push({
      severity: "info",
      category: "design_tokens",
      message: `${offBrand.length} node(s) use colors outside the Theseus design system.`,
      suggestion:
        "Use the Theseus palette: teal (#2D5F6B) for sources, purple (#7B5EA7) for concepts, terracotta (#C4503C) for people, amber (#C49A4A) for hunches.",
      nodes: offBrand.map((n) => n.id),
    });
  }

  return findings;
}

/**
 * Check camera positioning relative to scene extent.
 */
function checkCamera(scene: SceneGraph): Finding[] {
  const findings: Finding[] = [];
  if (scene.nodes.length === 0) return findings;

  const cam = scene.camera;
  const camDist = dist(cam.position, cam.target);

  // Scene extent
  const positions = scene.nodes.map((n) => n.position);
  const maxExtent = Math.max(
    ...positions.map((p) => Math.abs(p[0])),
    ...positions.map((p) => Math.abs(p[1])),
    ...positions.map((p) => Math.abs(p[2])),
    1
  );

  const ratio = camDist / maxExtent;

  if (ratio < 1.2) {
    findings.push({
      severity: "warning",
      category: "camera",
      message: `Camera is very close (${camDist.toFixed(1)} units, scene extent ${maxExtent.toFixed(1)}). Some nodes may be clipped or off-screen.`,
      suggestion: `Pull camera back to at least ${(maxExtent * 1.8).toFixed(1)} units from the target for comfortable framing.`,
    });
  } else if (ratio > 5.0) {
    findings.push({
      severity: "info",
      category: "camera",
      message: `Camera is far from the scene (${camDist.toFixed(1)} units, scene extent ${maxExtent.toFixed(1)}). Nodes may appear small.`,
      suggestion: `Move camera closer (around ${(maxExtent * 2.0).toFixed(1)} units) so node labels are legible.`,
    });
  }

  return findings;
}

/**
 * Run all heuristics against a scene and produce a scored evaluation.
 */
export function evaluateScene(scene: SceneGraph): EvaluationResult {
  const allFindings: Finding[] = [
    ...checkVisualHierarchy(scene),
    ...checkSpacing(scene),
    ...checkEdgeCrossings(scene),
    ...checkDesignTokens(scene),
    ...checkCamera(scene),
  ];

  // Score: start at 100, deduct for findings
  let score = 100;
  for (const f of allFindings) {
    if (f.severity === "error") score -= 20;
    else if (f.severity === "warning") score -= 10;
    else if (f.severity === "info") score -= 3;
  }
  score = Math.max(0, score);

  // Generate summary
  const errorCount = allFindings.filter((f) => f.severity === "error").length;
  const warnCount = allFindings.filter((f) => f.severity === "warning").length;
  const infoCount = allFindings.filter((f) => f.severity === "info").length;

  let summary: string;
  if (allFindings.length === 0) {
    summary = "Clean scene. No design issues detected.";
  } else if (errorCount > 0) {
    summary = `${errorCount} critical issue(s) need attention. ${warnCount} warning(s), ${infoCount} note(s).`;
  } else if (warnCount > 0) {
    summary = `${warnCount} warning(s) to address for better readability. ${infoCount} note(s).`;
  } else {
    summary = `${infoCount} minor note(s). Scene is generally well-composed.`;
  }

  return {
    scene_id: scene.id,
    score,
    findings: allFindings,
    summary,
  };
}
