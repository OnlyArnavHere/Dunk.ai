/**
 * Stage F — 3D model, generalised from the Gas Leakage Detector's scripts/glb.mjs.
 *
 * Reads the SAME dist/circuit.json the 2D views are drawn from, so switching to
 * the 3D tab never re-evaluates the design and cannot show a different board.
 *
 * The raw export is dominated by STEP-derived chip bodies (on the Phase 1 board:
 * 25.35 MB, of which one LQFP-32 was 64k triangles). The transform chain below
 * takes that to roughly 3 MB without touching the geometry — the triangle count
 * is identical before and after. Dropping unused UV sets has to come FIRST:
 * the STEP bodies carry a unique UV per vertex even on untextured materials,
 * and that blocks welding, which is what makes dedup/weld worth running at all.
 */

import { readFile, writeFile, stat } from "node:fs/promises"
import path from "node:path"
import { stage, note } from "../lib/events.mjs"

const mb = (n) => `${(n / 1e6).toFixed(2)} MB`

export async function buildGltf(outDir, opts = {}) {
  stage("F", "running")

  const { convertCircuitJsonToGltf } = await import("circuit-json-to-gltf")
  const { NodeIO } = await import("@gltf-transform/core")
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions")
  const { dedup, weld, prune, quantize, meshopt } = await import("@gltf-transform/functions")
  const { MeshoptEncoder } = await import("meshoptimizer")

  const circuitJson = JSON.parse(await readFile(path.join(outDir, "circuit.json"), "utf-8"))

  const started = Date.now()
  const raw = Buffer.from(
    await convertCircuitJsonToGltf(circuitJson, {
      format: "glb",
      includeModels: true,
      boardTextureResolution: opts.textureResolution ?? 2048,
      boardDrillQuality: "high",
    })
  )
  note(`  exported ${mb(raw.length)} in ${((Date.now() - started) / 1000).toFixed(1)}s`)

  await MeshoptEncoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder })
  const doc = await io.readBinary(raw)

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial()
      const textured =
        mat &&
        (mat.getBaseColorTexture() ||
          mat.getNormalTexture() ||
          mat.getEmissiveTexture() ||
          mat.getMetallicRoughnessTexture() ||
          mat.getOcclusionTexture())
      if (textured) continue
      for (const semantic of prim.listSemantics()) {
        if (semantic.startsWith("TEXCOORD")) prim.setAttribute(semantic, null)
      }
    }
  }

  await doc.transform(
    dedup(),
    weld(),
    prune(),
    dedup(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: "high" })
  )

  const glbPath = path.join(outDir, "board.glb")
  await writeFile(glbPath, Buffer.from(await io.writeBinary(doc)))

  // Same document as .gltf with buffers and textures inlined as data URIs, so
  // it is one self-contained JSON file that can be served from anywhere.
  const jsonDoc = await io.writeJSON(doc, { format: "GLTF" })
  const inline = (entries, mimeOf) => {
    for (const entry of entries ?? []) {
      const resource = entry.uri && jsonDoc.resources[entry.uri]
      if (!resource) continue
      entry.uri = `data:${mimeOf(entry)};base64,` + Buffer.from(resource).toString("base64")
    }
  }
  inline(jsonDoc.json.buffers, () => "application/octet-stream")
  inline(jsonDoc.json.images, (image) => image.mimeType || "image/png")

  const stillExternal = (jsonDoc.json.buffers ?? [])
    .concat(jsonDoc.json.images ?? [])
    .filter((e) => e.uri && !e.uri.startsWith("data:"))
  if (stillExternal.length) {
    throw new Error(`could not inline: ${stillExternal.map((e) => e.uri).join(", ")}`)
  }

  const gltfPath = path.join(outDir, "board.gltf.json")
  await writeFile(gltfPath, JSON.stringify(jsonDoc.json), "utf-8")

  const glbSize = (await stat(glbPath)).size
  const gltfSize = (await stat(gltfPath)).size
  const cadComponents = circuitJson.filter((e) => e.type === "cad_component").length

  const stats = {
    rawBytes: raw.length,
    glbBytes: glbSize,
    gltfBytes: gltfSize,
    cadComponents,
    meshes: doc.getRoot().listMeshes().length,
    nodes: doc.getRoot().listNodes().length,
  }

  stage(
    "F",
    "done",
    `${mb(raw.length)} raw -> ${mb(glbSize)} glb · ${mb(gltfSize)} inlined json · ` +
      `${cadComponents} CAD components on ${stats.meshes} unique meshes`
  )
  return stats
}
