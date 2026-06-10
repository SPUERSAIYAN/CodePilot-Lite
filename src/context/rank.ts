import type { DependencyGraph, RankedNode } from "./types.js";

const dampingFactor = 0.85;
const iterations = 20;

export function rankGraph(graph: DependencyGraph): RankedNode[] {
  const nodeIds = Array.from(graph.nodes).sort();
  const nodeCount = nodeIds.length;

  if (nodeCount === 0) {
    return [];
  }

  let scores = new Map(nodeIds.map((id) => [id, 1 / nodeCount]));
  const outgoingWeight = new Map<string, number>();

  for (const edge of graph.edges) {
    outgoingWeight.set(edge.from, (outgoingWeight.get(edge.from) ?? 0) + edge.weight);
  }

  for (let index = 0; index < iterations; index += 1) {
    const nextScores = new Map(nodeIds.map((id) => [id, (1 - dampingFactor) / nodeCount]));

    for (const edge of graph.edges) {
      const totalWeight = outgoingWeight.get(edge.from) ?? 0;
      if (totalWeight === 0) {
        continue;
      }

      const contribution = (scores.get(edge.from) ?? 0) * dampingFactor * (edge.weight / totalWeight);
      nextScores.set(edge.to, (nextScores.get(edge.to) ?? 0) + contribution);
    }

    scores = nextScores;
  }

  return nodeIds
    .map((id) => ({ id, score: scores.get(id) ?? 0 }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}
