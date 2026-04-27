import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCabinets, deleteCabinet, type CabinetSummary } from "../api/cabinetApi";

export function CabinetListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CabinetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Фильтр: "all" | "drafts" | clientId. По умолчанию все.
  const [filter, setFilter] = useState<string>("all");

  const reload = () => {
    setLoading(true);
    setError(null);
    listCabinets()
      .then(rows => setItems(rows))
      .catch(err => {
        console.error("Cabinets list failed:", err);
        setError(err.message || "Не удалось загрузить список");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const onDelete = async (id: string) => {
    try {
      await deleteCabinet(id);
      setConfirmDelete(null);
      reload();
    } catch (err: any) {
      alert("Ошибка удаления: " + (err?.message || err));
    }
  };

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();
      if (isToday) return `сегодня в ${d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
      return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return iso; }
  };

  // Уникальные клиенты в списке шкафов — для select-фильтра.
  const uniqueClients = (() => {
    const seen = new Map<string, string>();
    items.forEach(c => {
      if (c.client_id && c.client_name) seen.set(c.client_id, c.client_name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  })();

  // Применяем фильтр.
  const filteredItems = (() => {
    if (filter === "all") return items;
    if (filter === "drafts") return items.filter(c => !c.client_id);
    return items.filter(c => c.client_id === filter);
  })();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0b0c10",
      color: "#d1d5db",
      fontFamily: "'IBM Plex Mono', monospace",
      padding: "24px 16px",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 24, gap: 12, flexWrap: "wrap",
        }}>
          <div>
            <h1 style={{
              fontSize: 16, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", margin: 0, color: "#d1d5db",
            }}>Мои шкафы</h1>
            <p style={{ fontSize: 11, color: "#666", margin: "4px 0 0" }}>
              {items.length === 0
                ? "Пока пусто"
                : filter === "all"
                  ? `${items.length} ${items.length === 1 ? "проект" : items.length < 5 ? "проекта" : "проектов"}`
                  : `${filteredItems.length} из ${items.length}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Фильтр по клиенту */}
            {items.length > 0 && (
              <select
                value={filter}
                onChange={e => setFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: "#14151c",
                  color: "#d1d5db",
                  border: "1px solid #2a2b35",
                  fontFamily: "inherit",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <option value="all">Все шкафы</option>
                <option value="drafts">Только черновики</option>
                {uniqueClients.length > 0 && <option disabled>──────────</option>}
                {uniqueClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => navigate("/cabinet")}
              style={{
                padding: "10px 18px", borderRadius: 6,
                background: "#d97706", color: "#000",
                border: "none", cursor: "pointer", fontWeight: 700,
                fontFamily: "inherit", fontSize: 12,
                letterSpacing: "0.05em", textTransform: "uppercase",
              }}
            >+ Новый шкаф</button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "#666", padding: 40 }}>Загрузка…</div>
        )}

        {error && (
          <div style={{
            padding: 16, borderRadius: 6,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444",
          }}>
            {error}
            <button
              onClick={reload}
              style={{
                marginLeft: 12, padding: "4px 10px", borderRadius: 4,
                background: "transparent", color: "#ef4444",
                border: "1px solid #ef4444", cursor: "pointer",
                fontFamily: "inherit", fontSize: 11,
              }}
            >Повторить</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            border: "1px dashed #333", borderRadius: 8,
            color: "#666",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📐</div>
            <div style={{ marginBottom: 16 }}>Здесь будут ваши проекты шкафов</div>
            <button
              onClick={() => navigate("/cabinet")}
              style={{
                padding: "10px 18px", borderRadius: 6,
                background: "#d97706", color: "#000",
                border: "none", cursor: "pointer", fontWeight: 700,
                fontFamily: "inherit", fontSize: 12,
              }}
            >Создать первый</button>
          </div>
        )}

        {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
          <div style={{
            textAlign: "center", padding: "40px 20px",
            border: "1px dashed #333", borderRadius: 8,
            color: "#666",
          }}>
            <div style={{ marginBottom: 12 }}>По выбранному фильтру шкафов нет</div>
            <button
              onClick={() => setFilter("all")}
              style={{
                padding: "8px 16px", borderRadius: 6,
                background: "transparent", color: "#d1d5db",
                border: "1px solid #444", cursor: "pointer",
                fontFamily: "inherit", fontSize: 11,
              }}
            >Сбросить фильтр</button>
          </div>
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}>
            {filteredItems.map(c => (
              <div
                key={c.id}
                style={{
                  background: "rgba(20,21,28,0.9)",
                  border: "1px solid #2a2b35",
                  borderRadius: 8,
                  padding: 14,
                  cursor: "pointer",
                  transition: "border-color 150ms",
                  position: "relative",
                }}
                onClick={() => navigate(`/cabinet/${c.id}`)}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#d97706")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2b35")}
              >
                {/* Превью или плейсхолдер */}
                <div style={{
                  height: 140,
                  background: c.preview ? `url(${c.preview}) center/cover` : "linear-gradient(135deg, #1a1b22, #0f1015)",
                  borderRadius: 6,
                  marginBottom: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#444",
                  fontSize: 30,
                }}>
                  {!c.preview && "🪑"}
                </div>
                {/* Название */}
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: "#d1d5db", marginBottom: 4,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {c.name || "Без названия"}
                </div>
                {/* Габариты */}
                <div style={{ fontSize: 10, color: "#666", marginBottom: 6 }}>
                  {c.corpus.width}×{c.corpus.height}×{c.corpus.depth} мм
                </div>
                {/* Клиент или бейдж "Черновик" */}
                <div style={{ marginBottom: 6 }}>
                  {c.client_name ? (
                    <div style={{
                      fontSize: 10, color: "#22c55e",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      👤 {c.client_name}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: 9, color: "#888",
                      display: "inline-block",
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px dashed #444",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}>
                      Черновик
                    </div>
                  )}
                </div>
                {/* Мета */}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: 10, color: "#555",
                }}>
                  <span>{c.element_count} {c.element_count === 1 ? "деталь" : "деталей"}</span>
                  <span>{fmtDate(c.updated_at)}</span>
                </div>
                {/* Кнопка удаления */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(c.id);
                  }}
                  style={{
                    position: "absolute", top: 8, right: 8,
                    width: 26, height: 26, borderRadius: 4,
                    background: "rgba(11,12,16,0.85)",
                    color: "#888",
                    border: "1px solid #333",
                    cursor: "pointer", fontSize: 11,
                    fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = "#ef4444";
                    e.currentTarget.style.borderColor = "#ef4444";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = "#888";
                    e.currentTarget.style.borderColor = "#333";
                  }}
                  title="Удалить"
                >🗑</button>
              </div>
            ))}
          </div>
        )}

        {/* Confirm delete modal */}
        {confirmDelete && (
          <div
            onClick={() => setConfirmDelete(null)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 100,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#14151c",
                border: "1px solid #333",
                borderRadius: 8,
                padding: 24,
                maxWidth: 380,
                width: "90%",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                Удалить шкаф?
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>
                Это действие нельзя отменить.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfirmDelete(null)}
                  style={{
                    padding: "8px 14px", borderRadius: 6,
                    background: "transparent", color: "#888",
                    border: "1px solid #444", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12,
                  }}
                >Отмена</button>
                <button
                  onClick={() => onDelete(confirmDelete)}
                  style={{
                    padding: "8px 14px", borderRadius: 6,
                    background: "#ef4444", color: "#fff",
                    border: "none", cursor: "pointer", fontWeight: 700,
                    fontFamily: "inherit", fontSize: 12,
                  }}
                >Удалить</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
