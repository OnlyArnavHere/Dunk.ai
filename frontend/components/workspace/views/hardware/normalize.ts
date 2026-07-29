import { MarkerType } from '@xyflow/react'
import {
  classifyBus,
  KIND_ACCENTS,
  type BusFlowEdge,
  type HardwareEdgeSpec,
  type HardwareFlowNode,
  type HardwareKind,
  type HardwareNodeSpec,
  type HardwareSpec,
} from './types'

/* ------------------------------------------------------------------ */
/* AI-engine adapter — architecture_result.json → HardwareSpec         */
/* ------------------------------------------------------------------ */

/** Maps the AI engine's node categories onto hardware node kinds */
const CATEGORY_TO_KIND: Record<string, HardwareKind> = {
  processing: 'mcu',
  power: 'power',
  sensor: 'sensor',
  input: 'sensor',
  storage: 'memory',
  memory: 'memory',
  communication: 'peripheral',
  output: 'peripheral',
}

interface EngineNode {
  id: string
  data?: {
    label?: string
    category?: string
    inferred?: boolean
    sourceRequirements?: string[]
  }
  position?: { x: number; y: number }
}

interface EngineEdge {
  id?: string
  source: string
  target: string
  label?: string
  data?: { interface?: string }
}

/** True when the payload looks like the AI engine's architecture output */
export function isEngineResult(json: unknown): boolean {
  const j = json as Record<string, unknown> | null
  return !!j && typeof j === 'object' && ('react_flow' in j || 'architecture_graph' in j)
}

/** Converts an ai_engine architecture_result.json payload into a HardwareSpec */
export function fromEngineResult(json: Record<string, unknown>): HardwareSpec {
  const graph = (json.react_flow || json.architecture_graph) as {
    nodes?: EngineNode[]
    edges?: EngineEdge[]
  }
  const nodes: HardwareNodeSpec[] = (graph.nodes || []).map((n: any) => {
    const category = n.data?.category || n.category || ''
    return {
      id: n.id,
      kind: CATEGORY_TO_KIND[category.toLowerCase()] || 'peripheral',
      label: n.data?.label || n.label || n.id,
      category,
      inferred: n.data?.inferred || n.inferred,
      sourceRequirements: n.data?.sourceRequirements || n.sourceRequirements,
      position: n.position,
    }
  })
  const edges: HardwareEdgeSpec[] = (graph.edges || []).map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    bus: e.data?.interface || e.interface || String(e.label || 'GPIO'),
    label: typeof e.label === 'string' ? e.label : undefined,
  }))
  return { meta: { name: 'AI architecture' }, nodes, edges }
}

/** Accepts either a HardwareSpec or an AI-engine result and returns a HardwareSpec */
export function toHardwareSpec(json: unknown): HardwareSpec {
  if (isEngineResult(json)) return fromEngineResult(json as Record<string, unknown>)
  const spec = json as HardwareSpec
  if (!spec || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
    throw new Error('Invalid spec: expected { nodes: [], edges: [] }')
  }
  return spec
}

/* ------------------------------------------------------------------ */
/* Layout + React Flow conversion                                      */
/* ------------------------------------------------------------------ */

/** Column order for auto layout when positions are missing: power feeds from the
 *  left, sensors feed the MCU in the middle, memory/comm hang off the right */
const KIND_COLUMN: Record<HardwareKind, number> = {
  power: 0,
  sensor: 1,
  mcu: 2,
  memory: 3,
  peripheral: 3,
}

const COL_W = 320
const ROW_H = 190

function autoLayout(nodes: HardwareNodeSpec[]): HardwareNodeSpec[] {
  const rows: Record<number, number> = {}
  return nodes.map((n) => {
    if (n.position) return n
    const col = KIND_COLUMN[n.kind]
    const row = rows[col] ?? 0
    rows[col] = row + 1
    return { ...n, position: { x: col * COL_W, y: row * ROW_H + (col % 2) * 60 } }
  })
}

export function specToFlow(spec: HardwareSpec): { nodes: HardwareFlowNode[]; edges: BusFlowEdge[] } {
  const laid = autoLayout(spec.nodes)
  const nodes: HardwareFlowNode[] = laid.map((n) => ({
    id: n.id,
    type: n.kind,
    position: n.position!,
    data: { spec: n, dimmed: false },
  }))
  const edges: BusFlowEdge[] = spec.edges.map((e) => {
    const busClass = classifyBus(e.bus)
    return {
      id: e.id || `${e.source}-${e.bus}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'bus',
      // Power enters at the top and leaves from the bottom; data flows left → right
      sourceHandle: busClass === 'power' ? 'power-out' : 'out',
      targetHandle: busClass === 'power' ? 'power-in' : 'in',
      label: e.label || e.bus,
      data: { bus: e.bus, busClass, active: false, dimmed: false },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    }
  })
  return { nodes, edges }
}

/** Serializes the live canvas back into a HardwareSpec (positions included) */
export function flowToSpec(spec: HardwareSpec, nodes: HardwareFlowNode[]): HardwareSpec {
  return {
    ...spec,
    nodes: spec.nodes.map((n) => {
      const live = nodes.find((fn) => fn.id === n.id)
      return live ? { ...n, position: { x: Math.round(live.position.x), y: Math.round(live.position.y) } } : n
    }),
  }
}

export function minimapColor(node: HardwareFlowNode): string {
  return KIND_ACCENTS[node.data.spec.kind]?.minimap || '#888'
}
