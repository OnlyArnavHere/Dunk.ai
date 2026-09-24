'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { Box, Loader2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Real 3D board view.
//
// board-3d.tsx renders an APPROXIMATION: it parses a .kicad_pcb and extrudes
// boxes from silkscreen rectangles because it has no component geometry. This
// component loads the actual model dunkai-designer exported from the same
// circuit.json the 2D views are drawn from — real STEP-derived component bodies,
// copper and silkscreen baked into board textures, drills cut out of the
// outline.
//
// The file is meshopt-compressed (EXT_meshopt_compression) and quantized
// (KHR_mesh_quantization), which is what takes it from ~25MB to ~3MB. Both are
// standard Khronos extensions, but the decoder is NOT automatic: without
// setMeshoptDecoder the loader throws "THREE.GLTFLoader: setMeshoptDecoder must
// be called before loading compressed files".
// ---------------------------------------------------------------------------

type View = 'iso' | 'top' | 'bottom'

/**
 * Frame the board by projecting the eight bounding-box corners into camera
 * space rather than fitting the bounding sphere. Tall header pins inflate the
 * sphere radius enough to leave the board noticeably small in a wide frame.
 */
function frameBox(camera: THREE.PerspectiveCamera, box: THREE.Box3, view: View) {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const diag = Math.max(size.length(), 0.001)

  const direction =
    view === 'top'
      ? new THREE.Vector3(0, 1, 0.0001)
      : view === 'bottom'
        ? new THREE.Vector3(0, -1, 0.0001)
        : new THREE.Vector3(0.55, 0.62, 0.85)

  camera.position.copy(center).addScaledVector(direction.normalize(), diag)
  camera.up.set(0, view === 'bottom' ? -1 : 1, 0)
  camera.lookAt(center)
  camera.updateMatrixWorld()

  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ]

  const vFov = (camera.fov * Math.PI) / 180
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)

  let needed = 0
  for (const corner of corners) {
    const local = corner.clone().applyMatrix4(camera.matrixWorldInverse)
    const depth = -local.z
    needed = Math.max(
      needed,
      depth + Math.abs(local.y) / Math.tan(vFov / 2),
      depth + Math.abs(local.x) / Math.tan(hFov / 2)
    )
  }

  camera.position.copy(center).addScaledVector(direction, needed * 1.06)
  camera.lookAt(center)
  camera.near = Math.max(needed / 500, 0.01)
  camera.far = needed * 10
  camera.updateProjectionMatrix()
  return center
}

export function BoardGltf({ src }: { src: string }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string>('')
  const [view, setView] = useState<View>('iso')
  const [spin, setSpin] = useState(false)

  // Imperative handles the control buttons reach into, so changing the view
  // re-frames the existing scene instead of reloading the model.
  const apiRef = useRef<{ setView: (v: View) => void; fit: () => void } | null>(null)
  const spinRef = useRef(spin)
  spinRef.current = spin

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    setStatus('loading')

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(120, 180, 100)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x8899ff, 0.45)
    fill.position.set(-120, -90, -70)
    scene.add(fill)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    let raf = 0
    let root: THREE.Object3D | null = null
    let box = new THREE.Box3()

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)

    loader.load(
      src,
      (gltf) => {
        if (disposed) return
        root = gltf.scene
        scene.add(root)
        box = new THREE.Box3().setFromObject(root)

        const applyView = (v: View) => {
          const center = frameBox(camera, box, v)
          controls.target.copy(center)
          const diag = box.getSize(new THREE.Vector3()).length()
          controls.minDistance = diag * 0.15
          controls.maxDistance = diag * 6
          controls.update()
        }

        apiRef.current = { setView: applyView, fit: () => applyView(view) }
        applyView(view)
        setStatus('ready')

        const tick = () => {
          if (spinRef.current && root) root.rotation.y += 0.0032
          controls.update()
          renderer.render(scene, camera)
          raf = requestAnimationFrame(tick)
        }
        tick()
      },
      undefined,
      (err) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : 'Could not load the 3D model')
        setStatus('error')
      }
    )

    const resize = () => {
      const { clientWidth, clientHeight } = mount
      if (!clientWidth || !clientHeight) return
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const m of mats) {
            if (!m) continue
            for (const key of Object.keys(m)) {
              const value = (m as unknown as Record<string, unknown>)[key]
              if (value instanceof THREE.Texture) value.dispose()
            }
            m.dispose()
          }
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
      apiRef.current = null
    }
    // `view` is intentionally not a dependency: changing it re-frames through
    // apiRef rather than tearing down and re-downloading the model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const pick = (v: View) => {
    setView(v)
    apiRef.current?.setView(v)
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />

      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Loading 3D board…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <Box className="h-8 w-8" />
          <p className="text-sm">Could not load the 3D model.</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em]">{error}</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border bg-background/90 backdrop-blur">
            {(['iso', 'top', 'bottom'] as const).map((v) => (
              <button
                key={v}
                onClick={() => pick(v)}
                className={`h-8 px-3 text-xs capitalize transition-colors ${
                  view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSpin((s) => !s)}
            className={`h-8 rounded-lg border border-border px-3 text-xs backdrop-blur transition-colors ${
              spin ? 'bg-secondary text-foreground' : 'bg-background/90 text-muted-foreground hover:text-foreground'
            }`}
          >
            {spin ? 'Stop' : 'Spin'}
          </button>
        </div>
      )}
    </div>
  )
}
