/** Reading tscircuit's DRC output for the structured path's model-free fixes. */

/** Parts placed past the board edge: the outline is too small. */
export const hasOffBoardParts = (circuitJson) =>
  circuitJson.some((e) => e.type.includes("error") && /outside the board/i.test(e.message ?? ""))
