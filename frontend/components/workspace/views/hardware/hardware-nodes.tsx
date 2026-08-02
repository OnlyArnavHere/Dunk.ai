'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Cpu,
  Gauge,
  HardDrive,
  Zap,
  Radio,
  BatteryCharging,
  Activity,
  Wifi,
} from 'lucide-react'
import type { HardwareFlowNode, HardwareKind } from './types'

/* ------------------------------------------------------------------ */
/* Shared chrome                                                       */
/* ------------------------------------------------------------------ */

const ACCENT: Record<HardwareKind, { border: string; text: string; glow: string; chip: string }> = {
  mcu: {
    border: 'border-cyan-500/30 dark:border-cyan-400/50',
    text: 'text-cyan-600 dark:text-cyan-400',
    glow: 'shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.28)]',
    chip: 'border-cyan-500/15 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300',
  },
  sensor: {
    border: 'border-emerald-500/30 dark:border-emerald-400/50',
    text: 'text-emerald-600 dark:text-emerald-400',
    glow: 'shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.28)]',
    chip: 'border-emerald-500/15 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300',
  },
  memory: {
    border: 'border-violet-500/30 dark:border-violet-400/50',
    text: 'text-violet-600 dark:text-violet-400',
    glow: 'shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.28)]',
    chip: 'border-violet-500/15 bg-violet-50 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300',
  },
  power: {
    border: 'border-amber-500/30 dark:border-amber-400/50',
    text: 'text-amber-600 dark:text-amber-400',
    glow: 'shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.28)]',
    chip: 'border-amber-500/15 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300',
  },
  peripheral: {
    border: 'border-pink-500/30 dark:border-pink-400/50',
    text: 'text-pink-600 dark:text-pink-400',
    glow: 'shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.28)]',
    chip: 'border-pink-500/15 bg-pink-50 text-pink-700 dark:border-pink-400/25 dark:bg-pink-400/10 dark:text-pink-300',
  },
}

/** Pin-style connection handles: power top/bottom, data left/right */
function Pins({ accent }: { accent: string }) {
  const cls = `!h-2 !w-2 !rounded-sm !border-none ${accent}`
  return (
    <>
      <Handle id="power-in" type="target" position={Position.Top} className={cls} style={{ background: 'currentColor' }} />
      <Handle id="in" type="target" position={Position.Left} className={cls} style={{ background: 'currentColor' }} />
      <Handle id="out" type="source" position={Position.Right} className={cls} style={{ background: 'currentColor' }} />
      <Handle id="power-out" type="source" position={Position.Bottom} className={cls} style={{ background: 'currentColor' }} />
    </>
  )
}

function Shell({
  kind,
  selected,
  dimmed,
  icon: Icon,
  tag,
  title,
  part,
  inferred,
  children,
}: {
  kind: HardwareKind
  selected?: boolean
  dimmed?: boolean
  icon: React.ComponentType<{ className?: string }>
  tag: string
  title: string
  part?: string
  inferred?: boolean
  children?: React.ReactNode
}) {
  const a = ACCENT[kind]
  return (
    <div
      className={`group w-[220px] overflow-hidden rounded-lg border bg-white text-slate-900 backdrop-blur transition-[transform,border-color,background-color,box-shadow,opacity] duration-200 dark:bg-[#111315] dark:text-foreground/95 ${a.border} ${
        selected
          ? `${a.glow} border-current bg-slate-50 dark:bg-[#14171a]`
          : 'shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_10px_28px_rgba(15,23,42,0.12)] dark:shadow-[0_1px_0_rgba(255,255,255,0.03),0_10px_24px_rgba(0,0,0,0.26)] dark:hover:border-white/12 dark:hover:bg-[#131519] dark:hover:shadow-[0_1px_0_rgba(255,255,255,0.04),0_14px_28px_rgba(0,0,0,0.3)]'
      } ${dimmed ? 'opacity-30' : 'opacity-100'}`}
    >
      <Pins accent={a.text} />
      {/* Header strip */}
      <div className={`flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5 dark:border-white/8 dark:bg-white/[0.02] ${a.border}`}>
        <span className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.24em] ${a.text}`}>
          <Icon className="h-3 w-3" />
          {tag}
        </span>
        {inferred && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-muted-foreground">
            inferred
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-[15px] font-semibold leading-5 text-slate-900 dark:text-foreground">{title}</p>
        {part && <p className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-muted-foreground">{part}</p>}
        {children}
      </div>
    </div>
  )
}

function Chip({ kind, children }: { kind: HardwareKind; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${ACCENT[kind].chip}`}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Node components                                                     */
/* ------------------------------------------------------------------ */

export const McuNode = memo(({ data, selected }: NodeProps<HardwareFlowNode>) => {
  const { spec, dimmed } = data
  const s = spec.specs || {}
  return (
    <Shell kind="mcu" selected={selected} dimmed={dimmed} icon={Cpu} tag={spec.category || 'SoC / MCU'} title={spec.label} part={spec.part} inferred={spec.inferred}>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.clock && <Chip kind="mcu"><Activity className="h-2.5 w-2.5" />{s.clock}</Chip>}
        {s.cores != null && <Chip kind="mcu">{s.cores}×core</Chip>}
        {s.arch && <Chip kind="mcu">{s.arch}</Chip>}
      </div>
    </Shell>
  )
})
McuNode.displayName = 'McuNode'

export const SensorNode = memo(({ data, selected }: NodeProps<HardwareFlowNode>) => {
  const { spec, dimmed } = data
  const s = spec.specs || {}
  return (
    <Shell kind="sensor" selected={selected} dimmed={dimmed} icon={Gauge} tag={spec.category || 'Sensor'} title={spec.label} part={spec.part} inferred={spec.inferred}>
      <div className="mt-2 flex items-center justify-between gap-2">
        {s.signal && <Chip kind="sensor">{s.signal}</Chip>}
        {s.reading && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-600 dark:text-foreground/80">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {s.reading}
          </span>
        )}
      </div>
    </Shell>
  )
})
SensorNode.displayName = 'SensorNode'

export const MemoryNode = memo(({ data, selected }: NodeProps<HardwareFlowNode>) => {
  const { spec, dimmed } = data
  const s = spec.specs || {}
  return (
    <Shell kind="memory" selected={selected} dimmed={dimmed} icon={HardDrive} tag={spec.category || 'Memory'} title={spec.label} part={spec.part} inferred={spec.inferred}>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.size && <Chip kind="memory">{s.size}</Chip>}
        {s.busWidth && <Chip kind="memory">{s.busWidth}</Chip>}
      </div>
    </Shell>
  )
})
MemoryNode.displayName = 'MemoryNode'

export const PowerNode = memo(({ data, selected }: NodeProps<HardwareFlowNode>) => {
  const { spec, dimmed } = data
  const s = spec.specs || {}
  const Icon = /batt/i.test(spec.label) ? BatteryCharging : Zap
  return (
    <Shell kind="power" selected={selected} dimmed={dimmed} icon={Icon} tag={spec.category || 'Power'} title={spec.label} part={spec.part} inferred={spec.inferred}>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(s.rails || []).map((rail) => (
          <Chip key={rail} kind="power">{rail}</Chip>
        ))}
      </div>
      {s.draw && s.draw !== '—' && (
        <p className="mt-1.5 font-mono text-[9px] text-slate-500 dark:text-muted-foreground">draw: {s.draw}</p>
      )}
    </Shell>
  )
})
PowerNode.displayName = 'PowerNode'

export const PeripheralNode = memo(({ data, selected }: NodeProps<HardwareFlowNode>) => {
  const { spec, dimmed } = data
  const s = spec.specs || {}
  const Icon = s.rf ? Wifi : Radio
  return (
    <Shell kind="peripheral" selected={selected} dimmed={dimmed} icon={Icon} tag={spec.category || 'Comms'} title={spec.label} part={spec.part} inferred={spec.inferred}>
      <div className="mt-2 flex items-center gap-1.5">
        {s.protocol && <Chip kind="peripheral">{s.protocol}</Chip>}
        {s.rf && (
          <span className="flex items-end gap-[2px]" aria-label="RF signal">
            {[3, 5, 7].map((h) => (
              <span key={h} className="w-[3px] animate-pulse rounded-sm bg-pink-400/80" style={{ height: h * 2, animationDelay: `${h * 80}ms` }} />
            ))}
          </span>
        )}
      </div>
    </Shell>
  )
})
PeripheralNode.displayName = 'PeripheralNode'

export const nodeTypes = {
  mcu: McuNode,
  sensor: SensorNode,
  memory: MemoryNode,
  power: PowerNode,
  peripheral: PeripheralNode,
}
