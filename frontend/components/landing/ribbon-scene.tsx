"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Glossy ribbons and clay shapes that live *behind* the landing page.
 *
 * One fixed, transparent canvas covers the viewport. The orthographic camera
 * works in CSS pixels and follows window.scrollY exactly, so a point placed at
 * page coordinate (x, y) stays glued to the DOM at that spot while the page
 * scrolls. Everything is placed relative to the box of a section tagged
 * `data-ribbon="<name>"` (u, v are fractions of its width and height), which
 * is what keeps the art lined up with the copy at every screen size.
 *
 * A ribbon draws itself along its length: the hero's when the intro loader
 * lifts, the others as their section scrolls into view (and back out).
 * Every ribbon ends either off-screen or in open space with a rounded cap —
 * never behind a card, whose straight edge would slice the end off flat.
 *
 * Rendering is on demand (frameloop="demand"): a frame is drawn when the page
 * scrolls, the pointer moves, or something is mid-animation, and the idle
 * float runs at 30 fps. A transparent full-screen canvas redrawn 60 times a
 * second also forces every frosted-glass element above it to re-blur, so an
 * idle page that draws nothing is most of the performance budget.
 */

export type SectionBox = {
  key: string;
  top: number;
  height: number;
  /** Page x of the section's `[data-ribbon-anchor]` element (its headline), if any. */
  anchorLeft?: number;
};

/**
 * [u, v, z] places a point at a fraction of the section's width and height.
 * [u, v, z, dx] instead places it `dx` px from the section's anchor element's
 * left edge — used where a ribbon must clear text whose position moves with
 * the screen width (u is then only the fallback when there is no anchor).
 */
type RibbonPoint = [number, number, number] | [number, number, number, number];

type RibbonDef = {
  section: string;
  /** See RibbonPoint. z is in tube radii, for depth where the ribbon crosses itself. */
  points: RibbonPoint[];
  /** Hero: drawn by the intro. Others: drawn by scroll. */
  trigger: "intro" | "scroll";
};

type ShapeKind = "torus" | "capsule" | "sphere" | "ring" | "squiggle";

type ShapeDef = {
  section: string;
  kind: ShapeKind;
  u: number;
  v: number;
  /** Size relative to the viewport width; clamped below. */
  size: number;
  rot: [number, number, number];
  spin: number;
  /** Hidden on narrow screens, where there is no margin to float in. */
  wide?: boolean;
};

const RIBBONS: RibbonDef[] = [
  {
    // Lusion-style: sweeps in from the top right in the band between the nav
    // and the greeting, then drops down LEFT of the headline (anchored to it in
    // px) and curls away in the margin. It never crosses the greeting: the
    // greeting's blue gradient vanishes against a blue tube.
    section: "hero",
    trigger: "intro",
    points: [
      [1.08, 0.2, 0],
      [0.82, 0.11, 2],
      [0.52, 0.092, 2],
      [0.3, 0.1, 0, 60],
      [0.17, 0.13, 0, -30],
      [0.14, 0.24, -2, -70],
      [0.12, 0.38, -2, -80],
      [0.09, 0.53, 0, -95],
      [0.055, 0.66, 2],
      [0.05, 0.78, 2],
      [0.075, 0.88, 0],
    ],
  },
  {
    // A loop in the empty space right of the heading, ending above the bento
    // so its rounded tip is in view — clear of the paragraph (ends ~u 0.55).
    section: "outputs",
    trigger: "scroll",
    points: [
      [1.08, 0.05, 0],
      [0.9, 0.03, 1],
      [0.77, 0.07, 2],
      [0.73, 0.15, 2],
      [0.8, 0.2, 0],
      [0.88, 0.14, -2],
      [0.82, 0.06, -2],
      [0.7, 0.09, 0],
      [0.64, 0.135, 1],
    ],
  },
  {
    // A wave through the clear band above the heading. Running it through
    // the heading itself made light-on-cyan text unreadable in dark mode.
    section: "pricing",
    trigger: "scroll",
    points: [
      [-0.08, 0.075, 0],
      [0.12, 0.03, 1],
      [0.3, 0.07, 0],
      [0.47, 0.03, -1],
      [0.64, 0.02, 0],
      [0.8, 0.065, 1],
      [0.93, 0.04, 0],
      [1.08, 0.02, 0],
    ],
  },
  {
    // Curls around the CTA panel: out at the top left, behind, out at the right.
    section: "cta",
    trigger: "scroll",
    points: [
      [-0.08, 0.72, 0],
      [0.05, 0.6, 1],
      [0.07, 0.36, 2],
      [0.15, 0.14, 0],
      [0.35, 0.06, -3],
      [0.62, 0.05, -3],
      [0.86, 0.1, 0],
      [0.95, 0.3, 2],
      [0.94, 0.55, 1],
      [1.08, 0.74, 0],
    ],
  },
];

const SHAPES: ShapeDef[] = [
  { section: "hero", kind: "torus", u: 0.9, v: 0.2, size: 0.07, rot: [0.9, 0.3, 0], spin: 0.15, wide: true },
  { section: "hero", kind: "sphere", u: 0.95, v: 0.42, size: 0.05, rot: [0, 0, 0], spin: 0, wide: true },
  { section: "hero", kind: "capsule", u: 0.05, v: 0.3, size: 0.06, rot: [0.2, 0, 0.9], spin: 0.1, wide: true },
  { section: "hero", kind: "squiggle", u: 0.93, v: 0.78, size: 0.08, rot: [0.4, 0.2, 0.3], spin: 0.08, wide: true },
  { section: "hero", kind: "ring", u: 0.04, v: 0.9, size: 0.045, rot: [1.1, 0.4, 0], spin: 0.2, wide: true },
  { section: "outputs", kind: "sphere", u: 0.93, v: 0.3, size: 0.035, rot: [0, 0, 0], spin: 0, wide: true },
  { section: "outputs", kind: "capsule", u: 0.62, v: 0.02, size: 0.045, rot: [0.3, 0.4, -0.7], spin: 0.12, wide: true },
  { section: "pricing", kind: "torus", u: 0.06, v: 0.06, size: 0.05, rot: [1.2, 0.2, 0.3], spin: 0.15, wide: true },
  { section: "pricing", kind: "squiggle", u: 0.94, v: 0.3, size: 0.06, rot: [0.2, 0.6, 0.2], spin: 0.08, wide: true },
  { section: "cta", kind: "sphere", u: 0.12, v: 0.85, size: 0.04, rot: [0, 0, 0], spin: 0 },
  { section: "cta", kind: "ring", u: 0.9, v: 0.12, size: 0.05, rot: [0.6, 0.3, 0], spin: 0.2 },
  { section: "cta", kind: "capsule", u: 0.95, v: 0.88, size: 0.05, rot: [0.4, 0.1, 1.1], spin: 0.1, wide: true },
];

const INTRO_MS = 2000;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

type Palette = { ribbonA: THREE.Color; ribbonB: THREE.Color; clay: string };

const palette = (dark: boolean): Palette => ({
  // Deeper in dark mode, so light text crossing in front stays readable.
  ribbonA: new THREE.Color(dark ? "#169fb8" : "#5ce8f2"),
  ribbonB: new THREE.Color(dark ? "#2a5fcf" : "#2c9fdf"),
  clay: dark ? "#45437a" : "#c9c5f3",
});

/**
 * Two rounds of Chaikin corner-cutting over the control points, ends kept.
 * Catmull-Rom through sparse points leaves visible kinks where a straight-ish
 * run meets a bend; cutting the corners first gives it evenly round arcs.
 */
function smoothPath(points: THREE.Vector3[], rounds = 2): THREE.Vector3[] {
  let pts = points;
  for (let r = 0; r < rounds; r++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      next.push(pts[i].clone().lerp(pts[i + 1], 0.25), pts[i].clone().lerp(pts[i + 1], 0.75));
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/** Page-pixel coordinates -> world, for a camera centred horizontally. */
const toWorld = (x: number, y: number, z: number, width: number) => new THREE.Vector3(x - width / 2, -y, z);

/**
 * How far a scroll-triggered ribbon is drawn: 0 until its first point nears
 * the bottom of the viewport, 1 once the viewport has travelled past most of it.
 */
const scrollProgress = (minY: number, maxY: number, scrollY: number, vh: number) =>
  THREE.MathUtils.clamp((scrollY + vh * 0.92 - minY) / ((maxY - minY) * 0.9 + vh * 0.3), 0, 1);

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    // A soft studio reflection: what makes the tube and the clay read as glossy.
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Ribbon({
  def,
  box,
  width,
  radius,
  colors,
  introStart,
  reducedMotion,
}: {
  def: RibbonDef;
  box: SectionBox;
  width: number;
  radius: number;
  colors: Palette;
  introStart: MutableRefObject<number | null>;
  reducedMotion: boolean;
}) {
  const progress = useRef(0);
  const tip = useRef<THREE.Mesh>(null);
  const start = useRef<THREE.Mesh>(null);

  const { curve, geometry, segments, radial, minY, maxY } = useMemo(() => {
    const pts = def.points.map(([u, v, z, dx]) => {
      const x = dx !== undefined && box.anchorLeft !== undefined ? box.anchorLeft + dx : u * width;
      return toWorld(x, box.top + v * box.height, z * radius, width);
    });
    const curve = new THREE.CatmullRomCurve3(smoothPath(pts), false, "centripetal");
    // ~6 px per ring along the length, 28 around: a round silhouette at any bend.
    const segments = Math.min(640, Math.max(120, Math.round(curve.getLength() / 6)));
    const radial = 28;
    const geometry = new THREE.TubeGeometry(curve, segments, radius, radial, false);

    // Colour runs along the length: cyan at the start, deeper blue at the end.
    const uv = geometry.getAttribute("uv");
    const colorsAttr = new Float32Array(uv.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < uv.count; i++) {
      c.copy(colors.ribbonA).lerp(colors.ribbonB, uv.getX(i));
      colorsAttr.set([c.r, c.g, c.b], i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsAttr, 3));
    geometry.setDrawRange(0, 0);

    const ys = def.points.map(([, v]) => box.top + v * box.height);
    return { curve, geometry, segments, radial, minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [def, box, width, radius, colors]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const tipColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    let target: number;
    if (reducedMotion) target = 1;
    else if (def.trigger === "intro") {
      target = introStart.current === null ? 0 : easeOutCubic(Math.min(1, (performance.now() - introStart.current) / INTRO_MS));
    } else {
      target = scrollProgress(minY, maxY, window.scrollY, window.innerHeight);
    }
    // The intro is already eased in time; scroll targets get a damped follow.
    const before = progress.current;
    progress.current = def.trigger === "intro" ? target : THREE.MathUtils.damp(progress.current, target, 7, delta);
    const p = progress.current;
    // Still drawing (or easing toward the scroll position): ask for another frame.
    if (Math.abs(p - before) > 1e-4 || Math.abs(p - target) > 1e-3 || (def.trigger === "intro" && introStart.current === null)) {
      state.invalidate();
    }

    geometry.setDrawRange(0, Math.floor(p * segments) * radial * 6);

    // Rounded ends: a sphere at the start, and one riding the drawing tip.
    const shown = p > 0.003;
    if (start.current) start.current.visible = shown;
    if (tip.current) {
      tip.current.visible = shown;
      tip.current.position.copy(curve.getPointAt(Math.min(p, 1)));
      tipColor.copy(colors.ribbonA).lerp(colors.ribbonB, p);
      (tip.current.material as THREE.MeshStandardMaterial).color.copy(tipColor);
    }
  });

  return (
    <group>
      <mesh geometry={geometry} frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={0.16} metalness={0.02} envMapIntensity={1.1} />
      </mesh>
      <mesh ref={start} position={curve.getPointAt(0)} visible={false}>
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial color={colors.ribbonA} roughness={0.16} metalness={0.02} envMapIntensity={1.1} />
      </mesh>
      <mesh ref={tip} visible={false}>
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial roughness={0.16} metalness={0.02} envMapIntensity={1.1} />
      </mesh>
    </group>
  );
}

function shapeGeometry(kind: ShapeKind, s: number): THREE.BufferGeometry {
  switch (kind) {
    case "torus":
      return new THREE.TorusGeometry(s * 0.42, s * 0.17, 32, 72);
    case "ring":
      return new THREE.TorusGeometry(s * 0.4, s * 0.09, 24, 64);
    case "capsule":
      return new THREE.CapsuleGeometry(s * 0.17, s * 0.62, 12, 32);
    case "sphere":
      return new THREE.SphereGeometry(s * 0.34, 48, 32);
    case "squiggle": {
      const pts = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return new THREE.Vector3((t - 0.5) * s, Math.sin(t * Math.PI * 2.4) * s * 0.18, Math.cos(t * Math.PI * 2) * s * 0.08);
      });
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, s * 0.075, 20, false);
    }
  }
}

function Shape({
  def,
  index,
  box,
  width,
  colors,
  introStart,
  reducedMotion,
  pointer,
}: {
  def: ShapeDef;
  index: number;
  box: SectionBox;
  width: number;
  colors: Palette;
  introStart: MutableRefObject<number | null>;
  reducedMotion: boolean;
  pointer: MutableRefObject<{ x: number; y: number }>;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const size = THREE.MathUtils.clamp(def.size * width, 36, 150);
  const geometry = useMemo(() => shapeGeometry(def.kind, size), [def.kind, size]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const base = useMemo(() => toWorld(def.u * width, box.top + def.v * box.height, -size, width), [def, box, width, size]);
  const reveal = useRef(0);
  const phase = index * 1.7;

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const scrollY = window.scrollY;
    const vh = window.innerHeight;

    let target: number;
    if (reducedMotion) target = 1;
    else if (def.section === "hero") {
      target = introStart.current === null ? 0 : Math.min(1, (performance.now() - introStart.current - 300 - index * 120) / 700);
    } else {
      target = THREE.MathUtils.clamp((scrollY + vh * 0.85 - (box.top + def.v * box.height)) / (vh * 0.35), 0, 1);
    }
    const before = reveal.current;
    reveal.current = THREE.MathUtils.damp(reveal.current, Math.max(target, 0), 6, delta);
    if (Math.abs(reveal.current - before) > 1e-4 || (def.section === "hero" && introStart.current === null)) state.invalidate();
    const k = easeOutBack(THREE.MathUtils.clamp(reveal.current, 0, 1));
    m.scale.setScalar(Math.max(k, 0.0001));
    m.visible = reveal.current > 0.01;

    // Drift slower than the page (parallax), bob, lean toward the pointer.
    const t = state.clock.elapsedTime;
    const motion = reducedMotion ? 0 : 1;
    const parallax = (scrollY - box.top) * 0.12 * motion;
    m.position.set(
      base.x + pointer.current.x * 14 * motion,
      base.y - parallax + Math.sin(t * 0.8 + phase) * 8 * motion + pointer.current.y * 10 * motion,
      base.z
    );
    m.rotation.set(
      def.rot[0] + Math.sin(t * 0.5 + phase) * 0.15 * motion,
      def.rot[1] + t * def.spin * motion,
      def.rot[2]
    );
  });

  return (
    <mesh ref={mesh} geometry={geometry} visible={false}>
      <meshStandardMaterial color={colors.clay} roughness={0.5} metalness={0} envMapIntensity={0.95} />
    </mesh>
  );
}

/**
 * Keeps the camera glued to the page, and decides when a frame is needed.
 *
 * - Scroll, resize and pointer moves render immediately (in the same rAF as
 *   the DOM paints, so the art never lags the text).
 * - The idle float (bobbing, slow spin) ticks at 30 fps, not 60, and pauses
 *   4 s after the last input.
 * - If consecutive frames come in slow, the pixel ratio steps down once at a
 *   time — sharp on a fast GPU, smooth on a slow one.
 */
function Driver({ reducedMotion }: { reducedMotion: boolean }) {
  const { invalidate, setDpr, viewport } = useThree();
  const samples = useRef<number[]>([]);
  const last = useRef(0);

  useEffect(() => {
    let lastInput = performance.now();
    const kick = () => {
      lastInput = performance.now();
      invalidate();
    };
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    window.addEventListener("pointermove", kick, { passive: true });
    // The float pauses 4 s after the last scroll or pointer move: a reader who
    // is just reading costs no frames at all. Any input resumes it.
    const idle = reducedMotion
      ? 0
      : window.setInterval(() => performance.now() - lastInput < 4000 && invalidate(), 33);
    invalidate();
    return () => {
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      window.removeEventListener("pointermove", kick);
      window.clearInterval(idle);
    };
  }, [invalidate, reducedMotion]);

  useFrame(({ camera }) => {
    camera.position.y = -(window.scrollY + window.innerHeight / 2);

    const now = performance.now();
    const gap = now - last.current;
    last.current = now;
    // Only back-to-back frames (scrolling) say anything about frame cost.
    if (gap < 80) {
      samples.current.push(gap);
      if (samples.current.length >= 45) {
        const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
        samples.current = [];
        if (avg > 24 && viewport.dpr > 1) setDpr(Math.max(1, +(viewport.dpr - 0.25).toFixed(2)));
      }
    }
  });
  return null;
}

/** A conservative start on machines that report little memory or few cores. */
const initialDpr = () => {
  if (typeof window === "undefined") return 1;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowEnd = (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4;
  return Math.min(window.devicePixelRatio || 1, lowEnd ? 1 : 1.5);
};

export default function RibbonScene({
  sections,
  width,
  dark,
  active,
  reducedMotion,
  introStart,
}: {
  sections: SectionBox[];
  width: number;
  dark: boolean;
  active: boolean;
  reducedMotion: boolean;
  introStart: MutableRefObject<number | null>;
}) {
  const colors = useMemo(() => palette(dark), [dark]);
  const radius = THREE.MathUtils.clamp(width * 0.0095, 7, 19);
  const byKey = useMemo(() => Object.fromEntries(sections.map((s) => [s.key, s])), [sections]);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX / window.innerWidth - 0.5, y: 0.5 - e.clientY / window.innerHeight };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const narrow = width < 768;

  return (
    <Canvas
      orthographic
      flat
      frameloop={active ? "demand" : "never"}
      dpr={initialDpr()}
      camera={{ position: [0, 0, 1000], near: 1, far: 4000, zoom: 1 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <Environment />
      <Driver reducedMotion={reducedMotion} />
      <hemisphereLight args={["#ffffff", "#c8c8ff", 0.7]} />
      <directionalLight position={[-300, 600, 800]} intensity={1.4} />
      <directionalLight position={[500, -200, 400]} intensity={0.45} color="#d9e8ff" />

      {RIBBONS.map((def) =>
        byKey[def.section] ? (
          <Ribbon
            key={def.section}
            def={def}
            box={byKey[def.section]}
            width={width}
            radius={radius}
            colors={colors}
            introStart={introStart}
            reducedMotion={reducedMotion}
          />
        ) : null
      )}

      {SHAPES.map((def, i) =>
        byKey[def.section] && !(narrow && def.wide) ? (
          <Shape
            key={`${def.section}-${i}`}
            def={def}
            index={i}
            box={byKey[def.section]}
            width={width}
            colors={colors}
            introStart={introStart}
            reducedMotion={reducedMotion}
            pointer={pointer}
          />
        ) : null
      )}
    </Canvas>
  );
}
