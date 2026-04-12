import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { shoppingComparisonService } from "../services/ShoppingComparisonService";
import type { MarketComparisonEntry, ShoppingComparisonResult } from "../types/shopping";

const WEB_USER_STORAGE_KEY = "geofertas:web-user-id";

function getWebUserId() {
  return window.localStorage.getItem(WEB_USER_STORAGE_KEY) || "default_user";
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function ResultCard({
  entry,
  totalItems,
  isBest,
}: {
  entry: MarketComparisonEntry;
  totalItems: number;
  isBest: boolean;
}) {
  return (
    <div
      style={{
        background: "white",
        border: isBest ? "2px solid #0b5f55" : "1px solid rgba(0,0,0,0.10)",
        borderRadius: 16,
        padding: 14,
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{entry.marketName}</div>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.62)" }}>
            Cobertura {entry.coverage}/{totalItems}
          </div>
        </div>

        <div
          style={{
            alignSelf: "flex-start",
            padding: "6px 10px",
            borderRadius: 999,
            background: isBest ? "#0b5f55" : "rgba(11,95,85,0.10)",
            color: isBest ? "white" : "#0b5f55",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {isBest ? "Melhor opcao" : "Alternativa"}
        </div>
      </div>

      <div
        style={{
          background: "rgba(11,95,85,0.06)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.60)", fontWeight: 700 }}>
          Total estimado
        </div>
        <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900 }}>{currency(entry.total)}</div>
      </div>

      <div>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Itens cobertos</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entry.coveredItems.map(({ item, offer }) => (
            <div
              key={`${entry.marketName}-${item.name}`}
              style={{
                padding: "9px 10px",
                borderRadius: 10,
                background: "#f7f7f7",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ fontWeight: 700 }}>{item.name}</div>
              <div style={{ fontSize: 13, color: "rgba(0,0,0,0.68)" }}>
                {offer.productName} por {currency(offer.totalPrice)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {entry.missingItems.length > 0 ? (
        <div
          style={{
            background: "#fff7e8",
            border: "1px solid rgba(181,124,8,0.22)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Itens faltantes</div>
          <div style={{ fontSize: 14, color: "#7a5410" }}>
            {entry.missingItems.map((item) => item.name).join(", ")}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ResultadoLista() {
  const navigate = useNavigate();
  const [result, setResult] = useState<ShoppingComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadComparison() {
      setIsLoading(true);
      setError(null);

      try {
        const comparison = await shoppingComparisonService.compareActiveList(getWebUserId());
        if (!cancelled) {
          setResult(comparison);
        }
      } catch (loadError) {
        console.error("[ResultadoLista] error loading comparison", loadError);
        if (!cancelled) {
          setError("Nao foi possivel carregar o comparativo agora.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadComparison();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Resultado da lista</div>
        <div
          style={{
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            padding: 16,
            color: "rgba(0,0,0,0.68)",
          }}
        >
          Buscando ofertas e montando o comparativo...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Resultado da lista</div>
        <div
          style={{
            background: "#fff1f1",
            border: "1px solid rgba(176,0,32,0.18)",
            color: "#8a1c1c",
            borderRadius: 14,
            padding: 14,
          }}
        >
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "none",
            background: "#0b5f55",
            color: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!result || result.items.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Resultado da lista</div>
        <div
          style={{
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            padding: 14,
          }}
        >
          Nenhuma lista ativa encontrada. Monte uma lista para comparar os mercados.
        </div>
        <button
          onClick={() => navigate("/criar-lista")}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "none",
            background: "#0b5f55",
            color: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Criar lista
        </button>
      </div>
    );
  }

  if (result.ranking.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Resultado da lista</div>
        <div
          style={{
            background: "#fff7e8",
            border: "1px solid rgba(181,124,8,0.22)",
            borderRadius: 14,
            padding: 14,
          }}
        >
          Ainda nao encontramos ofertas suficientes para comparar sua lista. A lista foi salva e voce pode tentar novamente depois.
        </div>
        <div
          style={{
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {result.items.map((item) => (
            <div key={item.id || item.name} style={{ fontWeight: 600 }}>
              {item.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const bestMarket = result.bestMarket || result.ranking[0];
  const isPartial = bestMarket.coverage < result.items.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Resultado da lista</div>
        <div style={{ marginTop: 6, color: "rgba(0,0,0,0.68)" }}>
          {result.items.length} itens comparados em {result.ranking.length} mercados.
        </div>
      </div>

      <div
        style={{
          background: "#dff7c9",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.60)" }}>
          Melhor mercado nesta rodada
        </div>
        <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900 }}>{bestMarket.marketName}</div>
        <div style={{ marginTop: 4, color: "rgba(0,0,0,0.72)" }}>
          Cobertura {bestMarket.coverage}/{result.items.length} com total estimado de {currency(bestMarket.total)}.
        </div>
      </div>

      {isPartial ? (
        <div
          style={{
            background: "#fff7e8",
            border: "1px solid rgba(181,124,8,0.22)",
            borderRadius: 14,
            padding: 14,
            color: "#7a5410",
          }}
        >
          Comparativo parcial: o melhor mercado ainda nao cobre todos os itens da sua lista.
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {result.ranking.map((entry, index) => (
          <ResultCard
            key={`${entry.marketId || entry.marketName}-${index}`}
            entry={entry}
            totalItems={result.items.length}
            isBest={index === 0}
          />
        ))}
      </div>

      <button
        onClick={() => navigate("/criar-lista")}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "white",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Editar lista
      </button>
    </div>
  );
}
