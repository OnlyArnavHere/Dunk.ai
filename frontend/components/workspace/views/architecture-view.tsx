'use client'

import { useMemo } from 'react'
import { HardwareCanvas } from './hardware/hardware-canvas'
import { toHardwareSpec } from './hardware/normalize'
import type { HardwareSpec } from './hardware/types'
import sampleSpec from './hardware/hardware-spec.json'
import { useWorkspaceStore } from '@/lib/store'

export function ArchitectureView({ projectId: _projectId }: { projectId?: string } = {}) {
  const aiArchitecture = useWorkspaceStore((s) => s.aiOutput?.architecture)

  const spec = useMemo<HardwareSpec>(() => {
    // Prefer live AI output; fall back to sample spec when pipeline hasn't run yet
    const source = aiArchitecture ?? sampleSpec
    try {
      return toHardwareSpec(source) as HardwareSpec
    } catch {
      return toHardwareSpec(sampleSpec) as HardwareSpec
    }
  }, [aiArchitecture])

  return (
    <div className="h-full w-full">
      <HardwareCanvas spec={spec} />
    </div>
  )
}
