"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";

/**
 * Monochrome particle graph: drifting nodes wired by proximity, a few
 * bright white, the rest dim gray. The pointer stirs the field.
 *
 * Performance guards: capped pixel ratio, fixed node budget, the loop sleeps
 * while offscreen, and reduced-motion users get a single static frame. If
 * WebGL is unavailable the canvas stays hidden and the CSS gradient behind
 * it carries the hero.
 */
const NODES = 130;
const LINK_DIST = 0.24;
const LINK_DIST_SQ = LINK_DIST * LINK_DIST;

export function NetworkField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      let three: typeof import("three");
      try {
        three = await import("three");
      } catch {
        return;
      }
      if (cancelled || !canvas.isConnected) return;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new three.WebGLRenderer({ canvas, alpha: true, antialias: false });
      } catch {
        return;
      }

      const reduce =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

      const scene = new three.Scene();
      const camera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      camera.position.z = 1;

      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      const base = new Float32Array(NODES * 3);
      const seed = new Float32Array(NODES * 2);
      const hub = new Uint8Array(NODES);
      for (let i = 0; i < NODES; i += 1) {
        base[i * 3] = rand(-1, 1);
        base[i * 3 + 1] = rand(-1, 1);
        base[i * 3 + 2] = 0;
        seed[i * 2] = rand(0, Math.PI * 2);
        seed[i * 2 + 1] = rand(0.2, 0.9);
        hub[i] = Math.random() < 0.08 ? 1 : 0;
      }

      const dotGeo = new three.BufferGeometry();
      const dotArr = new Float32Array(NODES * 3);
      dotGeo.setAttribute("position", new three.BufferAttribute(dotArr, 3));
      const dotColors = new Float32Array(NODES * 3);
      // Dashboard-mirroring neutrals, resolved live from the app theme so the
      // field reads on dark zinc and light paper alike.
      const css = getComputedStyle(document.documentElement);
      const signal = new three.Color(css.getPropertyValue("--nx-ink").trim() || "#fafafa");
      const bone = new three.Color(css.getPropertyValue("--nx-faint").trim() || "#8e8e96");
      const paintDots = () => {
        for (let i = 0; i < NODES; i += 1) {
          const c = hub[i] === 1 ? signal : bone;
          dotColors[i * 3] = c.r;
          dotColors[i * 3 + 1] = c.g;
          dotColors[i * 3 + 2] = c.b;
        }
        (dotGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      };
      paintDots();
      dotGeo.setAttribute("color", new three.BufferAttribute(dotColors, 3));
      const dots = new three.Points(
        dotGeo,
        new three.PointsMaterial({
          size: 5.5,
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          sizeAttenuation: false,
        }),
      );
      scene.add(dots);

      const maxLinks = NODES * 4;
      const linkPos = new Float32Array(maxLinks * 2 * 3);
      const linkGeo = new three.BufferGeometry();
      linkGeo.setAttribute("position", new three.BufferAttribute(linkPos, 3));
      const links = new three.LineSegments(
        linkGeo,
        new three.LineBasicMaterial({ color: signal.clone(), transparent: true, opacity: 0.12 }),
      );
      scene.add(links);

      const pointer = { x: 10, y: 10, active: false };
      const onMove = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        pointer.active = true;
      };
      const onLeave = () => {
        pointer.active = false;
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);

      let width = 1;
      let height = 1;
      const resize = () => {
        const rect = parent.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        renderer.setSize(width, height, false);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(parent);

      let visible = true;
      const io = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0 },
      );
      io.observe(canvas);

      const step = (t: number) => {
        const a = width / Math.max(1, height);
        const px = pointer.x * a;
        const posAttr = dotGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        for (let i = 0; i < NODES; i += 1) {
          const s1 = seed[i * 2] ?? 0;
          const s2 = seed[i * 2 + 1] ?? 1;
          let x = (base[i * 3] ?? 0) + Math.sin(t * 0.00022 * s2 + s1) * 0.08;
          let y = (base[i * 3 + 1] ?? 0) + Math.cos(t * 0.00019 * s2 + s1 * 1.7) * 0.08;
          x *= a;
          if (pointer.active) {
            const dx = px - x;
            const dy = pointer.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 0.09 && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const pull = ((0.3 - d) / 0.3) * 0.035;
              x += (dx / d) * pull;
              y += (dy / d) * pull;
            }
          }
          arr[i * 3] = x / a;
          arr[i * 3 + 1] = y;
          arr[i * 3 + 2] = 0;
        }
        posAttr.needsUpdate = true;

        let li = 0;
        for (let i = 0; i < NODES && li < maxLinks; i += 1) {
          const ix = arr[i * 3] ?? 0;
          const iy = arr[i * 3 + 1] ?? 0;
          for (let j = i + 1; j < NODES && li < maxLinks; j += 1) {
            const jx = arr[j * 3] ?? 0;
            const jy = arr[j * 3 + 1] ?? 0;
            const dx = (ix - jx) * a;
            const dy = iy - jy;
            if (dx * dx + dy * dy < LINK_DIST_SQ * a) {
              linkPos[li * 6] = ix;
              linkPos[li * 6 + 1] = iy;
              linkPos[li * 6 + 2] = 0;
              linkPos[li * 6 + 3] = jx;
              linkPos[li * 6 + 4] = jy;
              linkPos[li * 6 + 5] = 0;
              li += 1;
            }
          }
        }
        linkGeo.setDrawRange(0, li * 2);
        (linkGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      };

      let raf = 0;
      let dead = false;
      if (reduce) {
        step(1200);
        renderer.render(scene, camera);
      } else {
        const loop = (t: number) => {
          if (dead) return;
          raf = requestAnimationFrame(loop);
          if (!visible || document.hidden) return;
          step(t);
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(loop);
      }

      // Repaint when the app theme flips (data-theme / class on <html>).
      const themeObserver = new MutationObserver(() => {
        const next = getComputedStyle(document.documentElement);
        signal.set(next.getPropertyValue("--nx-ink").trim() || "#fafafa");
        bone.set(next.getPropertyValue("--nx-faint").trim() || "#8e8e96");
        ((links.material as THREE.LineBasicMaterial).color as THREE.Color).copy(signal);
        paintDots();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class"],
      });

      cleanup = () => {
        dead = true;
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        themeObserver.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        dotGeo.dispose();
        linkGeo.dispose();
        (dots.material as THREE.Material).dispose();
        (links.material as THREE.Material).dispose();
        renderer.dispose();
      };
      if (cancelled) cleanup();
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
