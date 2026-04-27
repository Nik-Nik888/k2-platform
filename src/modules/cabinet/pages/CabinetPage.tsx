import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import WardrobeEditor from "../components/WardrobeEditor";
import { loadCabinet, type CabinetRow } from "../api/cabinetApi";

export function CabinetPage() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  // ?client_id=XXX в URL — для случая когда новый шкаф создаётся
  // из карточки клиента в CRM (кнопка "+ Создать шкаф для клиента").
  // Применяется только если шкаф ещё не сохранён (id отсутствует).
  const initialClientId = !id ? searchParams.get("client_id") : null;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CabinetRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    loadCabinet(id)
      .then(row => setData(row))
      .catch(err => {
        console.error("Cabinet load failed:", err);
        setError(err.message || "Не удалось загрузить шкаф");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#888", fontFamily: "'IBM Plex Mono',monospace",
      }}>
        Загрузка шкафа…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
        color: "#ef4444", fontFamily: "'IBM Plex Mono',monospace",
      }}>
        <div>{error}</div>
        <button
          onClick={() => navigate("/cabinet/list")}
          style={{
            padding: "8px 16px", borderRadius: 6,
            background: "#2a2b35", color: "#d1d5db",
            border: "1px solid #444", cursor: "pointer",
            fontFamily: "inherit",
          }}
        >← К списку</button>
      </div>
    );
  }

  return (
    <WardrobeEditor
      key={id || "draft"}
      cabinetId={id || null}
      initial={data ? {
        name: data.name,
        corpus: data.corpus,
        elements: data.elements,
        corpus_texture_id: data.corpus_texture_id,
        facade_texture_id: data.facade_texture_id,
        client_id: data.client_id,
      } : initialClientId ? {
        // Новый шкаф из CRM (?client_id=XXX) — клиент сразу привязан,
        // имя/корпус/элементы — дефолтные (заполнятся в WardrobeEditor).
        client_id: initialClientId,
      } : undefined}
      onCreated={(newId) => {
        navigate(`/cabinet/${newId}`, { replace: true });
      }}
    />
  );
}
