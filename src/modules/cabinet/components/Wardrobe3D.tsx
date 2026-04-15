import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

function loadTex(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    new THREE.TextureLoader().load(src, tex => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      resolve(tex);
    }, undefined, () => resolve(null));
  });
}

export default function Wardrobe3D({ corpus, elements, corpusTexture, facadeTexture, showDoors = true, onClose }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});

  const build = useCallback(async () => {
    const { width: W, height: H, depth: D, thickness: T } = corpus;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090c);

    const S = 1 / 1000;
    const w = W * S, h = H * S, d = D * S, tt = T * S;
    const iW = W - 2 * T, iH = H - 2 * T;

    const cTex = await loadTex(corpusTexture?.imgUrl);
    const fTex = await loadTex(facadeTexture?.imgUrl);

    const makeMat = (hex, tex, rX = 1, rY = 1, opts = {}) => {
      if (tex) {
        const t = tex.clone();
        t.repeat.set(rX, rY);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.0, ...opts });
      }
      return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex || "#8b7355"), roughness: 0.65, metalness: 0.0, ...opts });
    };

    const corpRepX = W / 600, corpRepY = H / 600;
    const corpMat = makeMat(corpusTexture?.hex, cTex, corpRepX, corpRepY);
    const facMat = makeMat(facadeTexture?.hex, fTex, 1, 1, { roughness: 0.4 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9, side: THREE.DoubleSide });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.25, metalness: 0.8 });
    const innerMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.9 });
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.2, metalness: 0.9 });

    const group = new THREE.Group();

    const addBox = (bw, bh, bd, x, y, z, mat) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m); return m;
    };

    // ═══ CORPUS ═══
    addBox(tt, h, d, -w / 2 + tt / 2, 0, 0, corpMat);
    addBox(tt, h, d, w / 2 - tt / 2, 0, 0, corpMat);
    addBox(w - 2 * tt, tt, d, 0, h / 2 - tt / 2, 0, corpMat);
    addBox(w - 2 * tt, tt, d, 0, -h / 2 + tt / 2, 0, corpMat);
    addBox(w - 2 * tt - 2 * S, h - 2 * tt - 2 * S, 3 * S, 0, 0, -d / 2 + tt + 1.5 * S, backMat);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(6, 6);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -h / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const toX = mmX => (mmX - iW / 2) * S;
    const toY = mmY => (iH / 2 - mmY) * S;

    elements.forEach(el => {
      if (el.type === "shelf") {
        const sw = (el.w || iW) * S;
        const elX = el.x || 0;
        // Shelf left edge in 3D coordinates
        const shelfCenterX = toX(elX + (el.w || iW) / 2);
        addBox(sw, tt, d - tt - 2 * S, shelfCenterX, toY(el.y || 0), tt / 2, corpMat);
      }

      if (el.type === "stud") {
        const pTop = el.pTop || 0, pBot = el.pBot || iH;
        const pH = (pBot - pTop) * S;
        // el.x is LEFT edge of stud, center of ЛДСП = el.x + T/2
        addBox(tt, pH, d - tt - 2 * S, toX((el.x || 0) + T / 2), toY(pTop + (pBot - pTop) / 2), tt / 2, corpMat);
      }

      if (el.type === "drawers") {
        const cnt = el.count || 3;
        const heights = el.drawerHeights || Array(cnt).fill(Math.floor((el.h || 450) / cnt));
        let accY = el.y || 0;
        const dw = (el.w || 400) * S;
        const sx = toX((el.x || 0) + (el.w || 400) / 2);

        for (let i = 0; i < cnt; i++) {
          const dh = heights[i] || 150;
          const sy = toY(accY + dh / 2);
          const frontH = (dh - 4) * S;

          addBox(dw - 4 * S, frontH, tt, sx, sy, d / 2 - tt / 2, facMat);

          const boxW = dw - 36 * S;
          const boxD = d * 0.75;
          const boxH = (dh - 40) * S;
          addBox(boxW, 3 * S, boxD, sx, sy - frontH / 2 + 12 * S, -d * 0.05, innerMat);
          addBox(3 * S, boxH, boxD, sx - boxW / 2, sy, -d * 0.05, innerMat);
          addBox(3 * S, boxH, boxD, sx + boxW / 2, sy, -d * 0.05, innerMat);
          addBox(boxW, boxH, 3 * S, sx, sy, -d * 0.05 - boxD / 2, innerMat);
          addBox(30 * S, 4 * S, 8 * S, sx, sy, d / 2 - tt + 4 * S + 4 * S, metalMat);

          accY += dh;
        }
      }

      if (el.type === "rod") {
        const rw = (el.w || 400) * S;
        const sx = toX((el.x || 0) + (el.w || 400) / 2);
        const sy = toY(el.y || 150);
        const rodGeo = new THREE.CylinderGeometry(8 * S, 8 * S, rw, 16);
        rodGeo.rotateZ(Math.PI / 2);
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(sx, sy, 0);
        rod.castShadow = true;
        group.add(rod);
        [-rw / 2 - 2 * S, rw / 2 + 2 * S].forEach(ox => {
          addBox(6 * S, 12 * S, 20 * S, sx + ox, sy + 4 * S, 0, metalMat);
          addBox(6 * S, 3 * S, 30 * S, sx + ox, sy + 10 * S, -5 * S, metalMat);
        });
      }

      /* ═══ DOORS — real ЛДСП thickness, proper gap from corpus ═══ */
      if (el.type === "door" && showDoors) {
        const hingeType = el.hingeType || "overlay";
        const isL = el.hingeSide === "left";
        const doorT = tt; // 16mm ЛДСП thickness

        // Door dimensions from 2D editor (already include overlaps)
        const doorW = (el.w || 400) * S;
        const doorH = (el.h || iH) * S;
        const doorX = toX((el.x || 0) + (el.w || 400) / 2);
        const doorY = toY((el.y || 0) + (el.h || iH) / 2);

        // BUG#4 FIX: Door Z position — 2mm gap from corpus front edge
        const GAP_FROM_CORPUS = 2 * S; // 2mm gap
        let doorZ;
        if (hingeType === "overlay") {
          // Накладная: door sits in front of corpus, with 2mm gap
          doorZ = d / 2 + GAP_FROM_CORPUS + doorT / 2;
        } else {
          // Вкладная: door recessed inside, flush with front edge minus gap
          doorZ = d / 2 - doorT / 2 - GAP_FROM_CORPUS;
        }

        // Door panel — real 16mm ЛДСП thickness
        addBox(doorW, doorH, doorT, doorX, doorY, doorZ, facMat);

        // Handle — metal bar, on front face of door
        const handleY = doorY;
        const handleX = isL ? doorX + doorW / 2 - 20 * S : doorX - doorW / 2 + 20 * S;
        addBox(4 * S, 40 * S, 10 * S, handleX, handleY, doorZ + doorT / 2 + 5 * S, metalMat);

        // Hinges — on the back face of door, connecting to corpus
        const hingeCount = doorH / S > 1800 ? 4 : doorH / S > 1200 ? 3 : 2;
        const hingeX = isL ? doorX - doorW / 2 + 3 * S : doorX + doorW / 2 - 3 * S;
        for (let hi = 0; hi < hingeCount; hi++) {
          const hFrac = hi === 0 ? 0.08 : hi === hingeCount - 1 ? 0.92 : (hi / (hingeCount - 1));
          const hingeY = doorY + doorH / 2 - doorH * hFrac;
          // Hinge cup (recessed into door back)
          addBox(10 * S, 14 * S, 4 * S, hingeX, hingeY, doorZ - doorT / 2 - 2 * S, metalMat);
          // Hinge arm (connects to corpus side)
          addBox(6 * S, 8 * S, GAP_FROM_CORPUS + 4 * S, hingeX, hingeY, doorZ - doorT / 2 - GAP_FROM_CORPUS / 2 - 2 * S, metalMat);
        }
      }
    });

    scene.add(group);

    // ═══ LIGHTING ═══
    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(amb);

    const key = new THREE.DirectionalLight(0xfff5e6, 0.8);
    key.position.set(2.5, 3, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1; key.shadow.camera.far = 15;
    key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xdde8ff, 0.35);
    fill.position.set(-3, 2, -1);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.2);
    rim.position.set(0, 1, -4);
    scene.add(rim);

    const bounce = new THREE.PointLight(0xd4a060, 0.1, 6);
    bounce.position.set(0, -h / 2 + 0.1, 1);
    scene.add(bounce);

    // ═══ CAMERA ═══
    const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.01, 50);
    const dist = Math.max(w, h) * 2;
    camera.position.set(dist * 0.7, dist * 0.25, dist * 0.85);
    camera.lookAt(0, 0, 0);

    // ═══ RENDERER ═══
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    return { scene, camera, renderer, dist };
  }, [corpus, elements, corpusTexture, facadeTexture, showDoors]);

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;

    build().then(({ scene, camera, renderer, dist }) => {
      if (cancelled) return;

      let isDragging = false, prevX = 0, prevY = 0, rotY = 0.35, rotX = 0.12, zoom = 1;

      const onWheel = e => { e.preventDefault(); zoom = Math.max(0.3, Math.min(3, zoom + e.deltaY * -0.0008)); };
      const onPointerDown = e => { isDragging = true; prevX = e.clientX; prevY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); };
      const onPointerMove = e => { if (!isDragging) return; rotY += (e.clientX - prevX) * 0.004; rotX = Math.max(-1.0, Math.min(1.0, rotX + (e.clientY - prevY) * 0.004)); prevX = e.clientX; prevY = e.clientY; };
      const onPointerUp = () => isDragging = false;

      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);

      const animate = () => {
        stateRef.current.animId = requestAnimationFrame(animate);
        if (!isDragging) rotY += 0.0015;
        const dd = dist * zoom;
        camera.position.set(Math.sin(rotY) * Math.cos(rotX) * dd, Math.sin(rotX) * dd, Math.cos(rotY) * Math.cos(rotX) * dd);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      animate();

      const onResize = () => {
        if (!mountRef.current) return;
        camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      };
      window.addEventListener("resize", onResize);

      stateRef.current.cleanup = () => {
        cancelAnimationFrame(stateRef.current.animId);
        renderer.domElement.removeEventListener("wheel", onWheel);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
      };
    });

    return () => { cancelled = true; stateRef.current.cleanup?.(); };
  }, [build]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#60a5fa", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 900, fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>3D</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#d1d5db", fontFamily: "'IBM Plex Mono',monospace" }}>3D Просмотр</div>
            <div style={{ fontSize: 11, color: "#444", fontFamily: "'IBM Plex Mono',monospace" }}>{corpus.width}×{corpus.height}×{corpus.depth} · Тяни = вращение · Скролл = зум</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
          border: "1px solid rgba(217,119,6,0.3)", background: "rgba(217,119,6,0.1)", color: "#d97706",
          fontFamily: "'IBM Plex Mono',monospace",
        }}>✕ Закрыть</button>
      </div>
      <div ref={mountRef} style={{ flex: 1, cursor: "grab" }} />
    </div>
  );
}
