import { Injectable, Logger } from "@nestjs/common";
import { toBytes32, toCanonicalHash } from "@handshake/contracts";
import { ProviderService } from "./provider.service";

export interface LineageEdge {
  child: string; // canonical hash
  parent: string; // canonical hash
}

export interface LineageGraph {
  root: string;
  nodes: string[];
  edges: LineageEdge[];
  truncated: boolean;
}

const MAX_NODES = 256; // hard cap so a pathological DAG can't run unbounded (Decision M)

// Reconstructs the lineage DAG OFF-chain by walking immediate `parents` hop-by-hop and verifying
// each edge with an on-chain getModel read. No on-chain recursion — depth x MAX_PARENTS would be
// exponential and exceed eth_call gas (Decision M).
@Injectable()
export class LineageService {
  private readonly logger = new Logger(LineageService.name);

  constructor(private readonly provider: ProviderService) {}

  async reconstructLineage(modelHashCanonical: string): Promise<LineageGraph> {
    const root = toCanonicalHash(modelHashCanonical);
    const contract = this.provider.getReadContract();
    if (!contract) {
      this.logger.warn("No registry configured — returning empty lineage.");
      return { root, nodes: [], edges: [], truncated: false };
    }

    const nodes = new Set<string>();
    const edges: LineageEdge[] = [];
    const visited = new Set<string>();
    const queue: string[] = [root];
    let truncated = false;

    while (queue.length > 0) {
      if (nodes.size >= MAX_NODES) {
        truncated = true;
        break;
      }
      const current = queue.shift() as string;
      if (visited.has(current)) continue;
      visited.add(current);

      const model = await contract.getModel(toBytes32(current));
      if (!model.exists) continue; // off-chain / not-yet-anchored node — skip (Decision L)
      nodes.add(current);

      const parents = (model.parents as string[]).map(toCanonicalHash);
      for (const parent of parents) {
        edges.push({ child: current, parent });
        if (!visited.has(parent)) queue.push(parent);
      }
    }

    return { root, nodes: [...nodes], edges, truncated };
  }
}
