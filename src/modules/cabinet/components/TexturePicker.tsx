import { useState, useRef, useEffect } from "react";

export const TEXTURE_CATALOG = [
  { id: "egger-w1100", code: "W1100 ST9",  name: "Белый Альпийский",     brand: "Egger",     hex: "#f2efe8", file: "egger-w1100-st9.jpg" },
  { id: "egger-h1401", code: "H1401 ST22", name: "Сосна Касцина",        brand: "Egger",     hex: "#d4c4a0", file: "egger-h1401-st22.jpg" },
  { id: "egger-h3158", code: "H3158 ST22", name: "Дуб Vicenza",          brand: "Egger",     hex: "#b89a6a", file: "egger-h3158-st22.jpg" },
  { id: "egger-h3325", code: "H3325 ST28", name: "Дуб Тоб. натуральный", brand: "Egger",     hex: "#c8a870", file: "egger-h3325-st28.jpg" },
  { id: "egger-h1137", code: "H1137 ST12", name: "Дуб Сонома",           brand: "Egger",     hex: "#c8a96e", file: "egger-h1137-st12.jpg" },
  { id: "egger-h1399", code: "H1399 ST10", name: "Дуб Денвер трюфель",   brand: "Egger",     hex: "#7a6248", file: "egger-h1399-st10.jpg" },
  { id: "egger-h3734", code: "H3734 ST9",  name: "Дуб Шато серый",       brand: "Egger",     hex: "#9a8a78", file: "egger-h3734-st9.jpg" },
  { id: "egger-h3058", code: "H3058 ST22", name: "Венге Мали",           brand: "Egger",     hex: "#3d2b1f", file: "egger-h3058-st22.jpg" },
  { id: "egger-h3700", code: "H3700 ST10", name: "Орех Пацифик нат.",    brand: "Egger",     hex: "#5c3a1e", file: "egger-h3700-st10.jpg" },
  { id: "egger-u702",  code: "U702 ST9",   name: "Кашемир",              brand: "Egger",     hex: "#b6a894", file: "egger-u702-st9.jpg" },
  { id: "egger-u727",  code: "U727 ST9",   name: "Серый камень",         brand: "Egger",     hex: "#8c8c8c", file: "egger-u727-st9.jpg" },
  { id: "egger-u999",  code: "U999 ST2",   name: "Чёрный",              brand: "Egger",     hex: "#1a1a1a", file: "egger-u999-st2.jpg" },
  { id: "krono-8622",  code: "8622 BS",    name: "Вяз Кебрано",          brand: "Kronospan", hex: "#7d5a3c", file: "krono-8622-bs.jpg" },
  { id: "krono-k002",  code: "K002 FP",    name: "Дуб Меридиан",         brand: "Kronospan", hex: "#c4a46c", file: "krono-k002-fp.jpg" },
  { id: "krono-k003",  code: "K003 FP",    name: "Ясень Шимо светлый",   brand: "Kronospan", hex: "#b8a088", file: "krono-k003-fp.jpg" },
  { id: "krono-0112",  code: "0112 PE",    name: "Белый гладкий",        brand: "Kronospan", hex: "#f5f5f0", file: "krono-0112-pe.jpg" },
];

/* ═══ Helper ═══ */
export function getTextureInfo(id, customTextures) {
  const c = TEXTURE_CATALOG.find(t => t.id === id);
  if (c) return { hex: c.hex, file: c.file, imgUrl: `/textures/${c.file}`, name: c.name, code: c.code };
  const cu = customTextures.find(t => t.id === id);
  if (cu) return { hex: cu.hex || "#666", file: "", imgUrl: cu.dataUrl, name: cu.name, code: cu.code || "" };
  return { hex: "#8b7355", file: "", imgUrl: null, name: "По умолчанию", code: "" };
}

/* ═══ Swatch component ═══ */
function Swatch({ tex, active, onClick, size = 36, loadedImages }) {
  const imgUrl = loadedImages[tex.id] || tex.imgUrl || null;
  return (
    <div onClick={onClick} title={`${tex.name}\n${tex.code || ""}`} style={{
      width: size, height: size, borderRadius: 5, cursor: "pointer", flexShrink: 0,
      background: imgUrl ? `url(${imgUrl}) center/cover` : tex.hex,
      border: active ? "2px solid #d97706" : "2px solid rgba(80,80,80,0.3)",
      boxShadow: active ? "0 0 8px rgba(217,119,6,0.5)" : "none",
    }} />
  );
}

/* ═══ MAIN COMPONENT ═══ */
export function TexturePicker({ corpusTextureId, facadeTextureId, onCorpusChange, onFacadeChange, customTextures, onAddCustom, customBrands, onAddBrand }) {
  const [tab, setTab] = useState("corpus");
  const [modalOpen, setModalOpen] = useState(false);
  const [loadedImages, setLoadedImages] = useState({});
  const [recentCorpus, setRecentCorpus] = useState([corpusTextureId]);
  const [recentFacade, setRecentFacade] = useState([facadeTextureId]);
  const [addingToBrand, setAddingToBrand] = useState(null); // brand name for upload target
  const [newBrandName, setNewBrandName] = useState("");
  const [showNewBrand, setShowNewBrand] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    TEXTURE_CATALOG.forEach(tex => {
      const img = new Image();
      img.onload = () => setLoadedImages(prev => ({ ...prev, [tex.id]: `/textures/${tex.file}` }));
      img.src = `/textures/${tex.file}`;
    });
  }, []);

  const activeId = tab === "corpus" ? corpusTextureId : facadeTextureId;
  const onChange = tab === "corpus" ? onCorpusChange : onFacadeChange;
  const recent = tab === "corpus" ? recentCorpus : recentFacade;
  const setRecent = tab === "corpus" ? setRecentCorpus : setRecentFacade;

  // Combine catalog + custom textures
  const allTextures = [
    ...TEXTURE_CATALOG.map(t => ({ ...t, imgUrl: loadedImages[t.id] || null })),
    ...customTextures.map(ct => ({ id: ct.id, code: ct.code || "", name: ct.name, brand: ct.brand || "Свои", hex: ct.hex || "#666", file: "", imgUrl: ct.dataUrl })),
  ];

  // All brands: built-in + custom
  const builtInBrands = [...new Set(TEXTURE_CATALOG.map(t => t.brand))];
  const extraBrands = (customBrands || []).filter(b => !builtInBrands.includes(b));
  const customOnlyBrands = [...new Set(customTextures.map(ct => ct.brand || "Свои"))].filter(b => !builtInBrands.includes(b) && !extraBrands.includes(b));
  const allBrands = [...builtInBrands, ...extraBrands, ...customOnlyBrands];

  const selectTexture = (id) => {
    onChange(id);
    setRecent(prev => [id, ...prev.filter(r => r !== id)].slice(0, 3));
    setModalOpen(false);
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const name = file.name.replace(/\.[^.]+$/, "");
      const id = `custom-${Date.now()}`;
      const brand = addingToBrand || "Свои";
      onAddCustom({ id, name, dataUrl, brand, hex: "#888", code: "" });
      selectTexture(id);
      setAddingToBrand(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const addNewBrand = () => {
    const name = newBrandName.trim();
    if (!name) return;
    if (onAddBrand) onAddBrand(name);
    setNewBrandName("");
    setShowNewBrand(false);
  };

  const recentItems = recent.map(id => allTextures.find(t => t.id === id)).filter(Boolean).slice(0, 3);

  return (
    <div>
      {/* Tab row */}
      <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
        <button onClick={() => setTab("corpus")} style={{
          flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 10, fontWeight: 700,
          cursor: "pointer", border: "none", textAlign: "center",
          background: tab === "corpus" ? "#d97706" : "rgba(30,30,40,0.5)",
          color: tab === "corpus" ? "#000" : "#6b7280",
        }}>Корпус</button>
        <button onClick={() => setTab("facade")} style={{
          flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 10, fontWeight: 700,
          cursor: "pointer", border: "none", textAlign: "center",
          background: tab === "facade" ? "#d97706" : "rgba(30,30,40,0.5)",
          color: tab === "facade" ? "#000" : "#6b7280",
        }}>Фасад</button>
      </div>

      {/* Compact: 3 recent + "..." button */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {recentItems.map(tex => (
          <Swatch key={tex.id} tex={tex} active={activeId === tex.id} onClick={() => selectTexture(tex.id)} loadedImages={loadedImages} />
        ))}
        {recentItems.length < 3 && Array.from({ length: 3 - recentItems.length }, (_, i) => (
          <div key={`empty-${i}`} style={{ width: 36, height: 36, borderRadius: 5, background: "rgba(30,30,40,0.3)", border: "2px dashed rgba(80,80,80,0.3)" }} />
        ))}
        <div onClick={() => setModalOpen(true)} style={{
          width: 36, height: 36, borderRadius: 5, cursor: "pointer", flexShrink: 0,
          background: "rgba(30,30,40,0.4)", border: "2px solid rgba(80,80,80,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#888", fontSize: 16, fontWeight: 900, letterSpacing: 2,
        }}>⋯</div>
      </div>

      {/* Current name */}
      <div style={{ fontSize: 9, color: "#888", marginTop: 4 }}>
        {allTextures.find(t => t.id === activeId)?.name || "—"}
        {allTextures.find(t => t.id === activeId)?.code ? ` · ${allTextures.find(t => t.id === activeId).code}` : ""}
      </div>

      {/* ═══ CATALOG MODAL ═══ */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalOpen(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} />
          <div onClick={e => e.stopPropagation()} style={{
            position: "relative", width: 460, maxHeight: "80vh", overflowY: "auto",
            background: "#111318", border: "1px solid #333", borderRadius: 10,
            padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#d1d5db" }}>Каталог текстур</div>
                <div style={{ fontSize: 11, color: "#555" }}>{tab === "corpus" ? "Корпус" : "Фасад"}</div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{
                width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer",
                background: "rgba(255,255,255,0.05)", color: "#888", fontSize: 16, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>

            {/* Brands */}
            {allBrands.map(brand => {
              const items = allTextures.filter(t => t.brand === brand);
              return (
                <div key={brand} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{brand} {items.length > 0 && <span style={{ color: "#555", fontWeight: 400 }}>({items.length})</span>}</div>
                    <button onClick={(e) => { e.stopPropagation(); setAddingToBrand(brand); fileRef.current?.click(); }} style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer",
                      border: "1px dashed #555", background: "transparent", color: "#888",
                    }}>+ Добавить</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                    {items.map(tex => (
                      <div key={tex.id} onClick={() => selectTexture(tex.id)} style={{ cursor: "pointer", textAlign: "center" }}>
                        <div style={{
                          width: "100%", aspectRatio: "1/1", borderRadius: 6,
                          background: tex.imgUrl ? `url(${tex.imgUrl}) center/cover` : tex.hex,
                          border: activeId === tex.id ? "2px solid #d97706" : "2px solid rgba(80,80,80,0.2)",
                          boxShadow: activeId === tex.id ? "0 0 10px rgba(217,119,6,0.5)" : "none",
                          transition: "all 0.15s",
                        }} />
                        <div style={{ fontSize: 9, color: "#999", marginTop: 3, lineHeight: 1.2 }}>{tex.name}</div>
                        {tex.code && <div style={{ fontSize: 8, color: "#555" }}>{tex.code}</div>}
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div style={{ gridColumn: "1/-1", padding: "12px 0", textAlign: "center", fontSize: 10, color: "#555", fontStyle: "italic" }}>Нет текстур. Нажмите «+ Добавить»</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add new brand group */}
            <div style={{ borderTop: "1px solid #222", paddingTop: 12, marginTop: 8 }}>
              {!showNewBrand ? (
                <button onClick={() => setShowNewBrand(true)} style={{
                  width: "100%", padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", border: "1px dashed #444", background: "rgba(30,30,40,0.3)",
                  color: "#888", textAlign: "center",
                }}>+ Добавить группу производителя</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text" placeholder="Название (напр. Lamarty)" value={newBrandName}
                    onChange={e => setNewBrandName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addNewBrand(); if (e.key === "Escape") { setShowNewBrand(false); setNewBrandName(""); } }}
                    autoFocus
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: 4, fontSize: 12,
                      background: "#0b0c10", border: "1px solid #d9770666", color: "#d1d5db",
                      outline: "none", fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  />
                  <button onClick={addNewBrand} style={{
                    padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                    cursor: "pointer", border: "none", background: "#d97706", color: "#000",
                  }}>OK</button>
                  <button onClick={() => { setShowNewBrand(false); setNewBrandName(""); }} style={{
                    padding: "6px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                    border: "1px solid #444", background: "transparent", color: "#888",
                  }}>✕</button>
                </div>
              )}
            </div>

            {/* Hidden file input */}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
          </div>
        </div>
      )}
    </div>
  );
}
