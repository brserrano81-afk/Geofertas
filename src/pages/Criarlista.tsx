import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ListManager } from "../services/ListManager";
import type { ShoppingListItem } from "../types/shopping";

const WEB_USER_STORAGE_KEY = "geofertas:web-user-id";

function getWebUserId() {
  const existing = window.localStorage.getItem(WEB_USER_STORAGE_KEY);
  if (existing) return existing;

  const generated = `web_user_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(WEB_USER_STORAGE_KEY, generated);
  return generated;
}

function parseItems(rawText: string): ShoppingListItem[] {
  return rawText
    .split(/\n|,/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: `item-${index + 1}`,
      name,
      quantity: 1,
    }));
}

export default function CriarLista() {
  const navigate = useNavigate();
  const [rawItems, setRawItems] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewItems = useMemo(() => parseItems(rawItems), [rawItems]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const items = parseItems(rawItems);
    if (items.length === 0) {
      setError("Adicione pelo menos um item para comparar.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const userId = getWebUserId();
      const listManager = new ListManager(userId);
      await listManager.persistList(items);
      navigate("/resultado-lista");
    } catch (submitError) {
      console.error("[CriarLista] error saving list", submitError);
      setError("Nao foi possivel salvar sua lista agora. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Criar lista</div>
        <div style={{ marginTop: 6, color: "rgba(0,0,0,0.68)" }}>
          Digite um item por linha para montar a lista ativa do MVP.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <textarea
          value={rawItems}
          onChange={(event) => setRawItems(event.target.value)}
          placeholder={"Exemplo:\nArroz\nFeijao\nCafe\nLeite"}
          rows={8}
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.12)",
            padding: 14,
            fontSize: 15,
            lineHeight: 1.4,
            background: "white",
            boxSizing: "border-box",
          }}
        />

        <div
          style={{
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Itens detectados: {previewItems.length}
          </div>

          {previewItems.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(0,0,0,0.60)" }}>
              Sua lista aparece aqui conforme voce digita.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {previewItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: "rgba(11,95,85,0.06)",
                    fontWeight: 600,
                  }}
                >
                  {item.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? (
          <div
            style={{
              background: "#fff1f1",
              border: "1px solid rgba(176,0,32,0.18)",
              color: "#8a1c1c",
              borderRadius: 12,
              padding: 12,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          style={{
            width: "100%",
            padding: "13px 14px",
            borderRadius: 14,
            border: "none",
            background: isSaving ? "#7aa8a1" : "#0b5f55",
            color: "white",
            fontWeight: 800,
            cursor: isSaving ? "progress" : "pointer",
          }}
        >
          {isSaving ? "Salvando lista..." : "Comparar lista"}
        </button>
      </form>
    </div>
  );
}
