import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { db } from "../firebase";
import { categoryMetadataService } from "../services/CategoryMetadataService";
import { offerHygieneService, type OfferSnapshot } from "../services/OfferHygieneService";

const WHATSAPP_URL =
  import.meta.env.VITE_WHATSAPP_ENTRY_URL ||
  "https://api.whatsapp.com/send?text=Oi%2C%20quero%20comparar%20minha%20lista%20com%20o%20Economiza%20Facil";

type MarketRecord = { id: string; name: string; address: string };
type OfferCard = {
  id: string;
  productName: string;
  productKey: string;
  marketName: string;
  categoryLabel: string;
  categoryId: string;
  price: number;
  regionLabel: string;
  freshnessLabel: string;
  updatedAtMs: number;
  savingsPercent: number;
};

type RawLandingOffer = OfferSnapshot &
  Record<string, unknown> & {
    marketId?: unknown;
    expiresAt?: unknown;
    updatedAt?: unknown;
    createdAt?: unknown;
    startsAt?: unknown;
  };

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const typed = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof typed.toDate === "function") {
      const parsed = typed.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof typed.seconds === "number") return new Date(typed.seconds * 1000);
    if (typeof typed._seconds === "number") return new Date(typed._seconds * 1000);
  }
  return null;
}

function freshnessLabel(value: unknown): string {
  const date = toDate(value);
  if (!date) return "Atualizado recentemente";
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 60 * 1000) return `Atualizado ha ${Math.max(1, Math.round(diff / 60000))} min`;
  if (diff < 24 * 60 * 60 * 1000) return `Atualizado ha ${Math.max(1, Math.round(diff / 3600000))} h`;
  return `Atualizado em ${date.toLocaleDateString("pt-BR")}`;
}

function regionLabel(market?: MarketRecord): string {
  if (!market?.address) return market?.name || "Sua regiao";
  const dash = market.address.split("-").map((part) => part.trim()).filter(Boolean);
  if (dash.length >= 2) return dash.slice(-2).join(" - ");
  const comma = market.address.split(",").map((part) => part.trim()).filter(Boolean);
  if (comma.length >= 2) return comma.slice(-2).join(" - ");
  return market.address;
}

function fallbackOffers(): OfferCard[] {
  return [
    {
      id: "fallback-1",
      productName: "Ofertas reais aparecem aqui assim que a base responder",
      productKey: "ofertas",
      marketName: "Economiza Facil",
      categoryLabel: "Radar de ofertas",
      categoryId: "radar",
      price: 0,
      regionLabel: "Cobertura em expansao",
      freshnessLabel: "Aguardando sincronizacao",
      updatedAtMs: Date.now(),
      savingsPercent: 0,
    },
    {
      id: "fallback-2",
      productName: "Comparacao completa da lista",
      productKey: "comparacao",
      marketName: "Mercados da regiao",
      categoryLabel: "Lista inteligente",
      categoryId: "lista",
      price: 0,
      regionLabel: "MVP comercial ativo",
      freshnessLabel: "Estrutura pronta para operar",
      updatedAtMs: Date.now() - 1,
      savingsPercent: 0,
    },
  ];
}

function sectionStyle(background = "rgba(255,255,255,0.78)") {
  return {
    padding: "clamp(22px, 4vw, 34px)",
    borderRadius: 30,
    background,
    border: "1px solid rgba(16,50,45,0.08)",
    boxShadow: "0 22px 60px rgba(13,50,45,0.08)",
  } as const;
}

function buildDerivedData(offers: OfferCard[]) {
  const spread = new Map<string, { min: number; max: number }>();
  for (const offer of offers) {
    if (offer.price <= 0) continue;
    const current = spread.get(offer.productKey);
    if (!current) spread.set(offer.productKey, { min: offer.price, max: offer.price });
    else {
      current.min = Math.min(current.min, offer.price);
      current.max = Math.max(current.max, offer.price);
    }
  }

  const enriched = offers
    .map((offer) => {
      const item = spread.get(offer.productKey);
      const savingsPercent =
        item && item.max > item.min ? Math.round(((item.max - offer.price) / item.max) * 100) : 0;
      return { ...offer, savingsPercent };
    })
    .sort((a, b) => {
      if (b.savingsPercent !== a.savingsPercent) return b.savingsPercent - a.savingsPercent;
      if (b.updatedAtMs !== a.updatedAtMs) return b.updatedAtMs - a.updatedAtMs;
      return a.price - b.price;
    });

  const ticker = enriched.length
    ? enriched.slice(0, 10).map((offer) =>
        `${offer.productName} por ${formatPrice(offer.price)} em ${offer.marketName}${offer.savingsPercent > 0 ? ` · ate ${offer.savingsPercent}% de economia` : ""}`,
      )
    : [
        "Compare ofertas reais entre mercados da sua regiao",
        "Descubra onde sua lista sai mais barata",
        "Economize antes de sair de casa",
      ];

  const marketBoard = Array.from(
    enriched.reduce((map, offer) => {
      if (offer.price <= 0) return map;
      const current = map.get(offer.marketName) || {
        marketName: offer.marketName,
        offersCount: 0,
        bestPrice: offer.price,
        regionLabel: offer.regionLabel,
      };
      current.offersCount += 1;
      current.bestPrice = Math.min(current.bestPrice, offer.price);
      current.regionLabel = offer.regionLabel;
      map.set(offer.marketName, current);
      return map;
    }, new Map<string, { marketName: string; offersCount: number; bestPrice: number; regionLabel: string }>()).values(),
  )
    .sort((a, b) => (b.offersCount !== a.offersCount ? b.offersCount - a.offersCount : a.bestPrice - b.bestPrice))
    .slice(0, 3);

  const comparison = Array.from(
    enriched.reduce((map, offer) => {
      if (offer.price <= 0) return map;
      const list = map.get(offer.productKey) || [];
      list.push(offer);
      map.set(offer.productKey, list);
      return map;
    }, new Map<string, OfferCard[]>()).values(),
  )
    .filter((group) => new Set(group.map((offer) => offer.marketName)).size >= 2)
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.price - b.price);
      const best = sorted[0];
      const second = sorted.find((offer) => offer.marketName !== best.marketName) || sorted[1];
      return {
        productName: best.productName,
        bestMarket: best.marketName,
        bestPrice: best.price,
        secondMarket: second?.marketName || "Outro mercado",
        secondPrice: second?.price || best.price,
        savingsPercent:
          second && second.price > best.price
            ? Math.round(((second.price - best.price) / second.price) * 100)
            : 0,
        freshness: best.freshnessLabel,
      };
    })
    .sort((a, b) => b.savingsPercent - a.savingsPercent)
    .slice(0, 4);

  const regions = Array.from(
    enriched.reduce((map, offer) => {
      const current = map.get(offer.regionLabel) || {
        regionLabel: offer.regionLabel,
        offersCount: 0,
        featuredMarket: offer.marketName,
        bestProduct: offer.productName,
        bestPrice: offer.price,
        bestSavings: offer.savingsPercent,
      };
      current.offersCount += 1;
      if (offer.savingsPercent > current.bestSavings || offer.price < current.bestPrice) {
        current.featuredMarket = offer.marketName;
        current.bestProduct = offer.productName;
        current.bestPrice = offer.price;
        current.bestSavings = offer.savingsPercent;
      }
      map.set(offer.regionLabel, current);
      return map;
    }, new Map<string, { regionLabel: string; offersCount: number; featuredMarket: string; bestProduct: string; bestPrice: number; bestSavings: number }>()).values(),
  )
    .sort((a, b) => (b.bestSavings !== a.bestSavings ? b.bestSavings - a.bestSavings : b.offersCount - a.offersCount))
    .slice(0, 3);

  return { enriched, ticker, marketBoard, comparison, regions };
}

export default function Home() {
  const [offers, setOffers] = useState<OfferCard[]>(fallbackOffers());
  const [isLoading, setIsLoading] = useState(true);
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [marketsLoaded, setMarketsLoaded] = useState(0);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [offersSnap, marketsSnap, categories] = await Promise.all([
          getDocs(collection(db, "offers")),
          getDocs(collection(db, "markets")),
          categoryMetadataService.getMap().catch(() => new Map()),
        ]);

        const markets = marketsSnap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return { id: docSnap.id, name: String(data.name || ""), address: String(data.address || "") };
        });

        const marketsById = new Map(markets.map((market) => [market.id, market]));
        const marketsByName = new Map(markets.map((market) => [normalizeText(market.name), market]));

        const normalized = offersSnap.docs
          .map((docSnap) => {
            const raw = { id: docSnap.id, ...(docSnap.data() as RawLandingOffer) } as RawLandingOffer;
            if (!offerHygieneService.isOfferUsableForSearch(raw)) return null;
            const expires = toDate(raw.expiresAt);
            if (expires && expires.getTime() < Date.now()) return null;

            const productName = String(raw.productName || raw.name || "").trim();
            const marketName = String(raw.marketName || raw.networkName || "").trim();
            const market =
              marketsById.get(String(raw.marketId || "").trim()) || marketsByName.get(normalizeText(marketName));
            const categoryId = String(raw.category || "ofertas").trim().toLowerCase();
            const updatedAt = toDate(raw.updatedAt) || toDate(raw.createdAt) || toDate(raw.startsAt);

            return {
              id: docSnap.id,
              productName,
              productKey: normalizeText(productName),
              marketName,
              categoryLabel: categories.get(categoryId)?.nome || titleCase(categoryId.replace(/_/g, " ")),
              categoryId,
              price: Number(raw.price || raw.promoPrice || 0),
              regionLabel: regionLabel(market),
              freshnessLabel: freshnessLabel(updatedAt),
              updatedAtMs: updatedAt?.getTime() || 0,
              savingsPercent: 0,
            } satisfies OfferCard;
          })
          .filter((item): item is OfferCard => Boolean(item));

        if (!alive) return;
        setOffers(normalized.length ? normalized : fallbackOffers());
        setMarketsLoaded(markets.length);
        setHasConnectionError(!normalized.length);
      } catch (error) {
        console.error("[Home] load error", error);
        if (!alive) return;
        setOffers(fallbackOffers());
        setHasConnectionError(true);
      } finally {
        if (alive) setIsLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const { enriched, ticker, marketBoard, comparison, regions } = buildDerivedData(offers);
  const cards = enriched.filter((offer) => offer.price > 0).slice(0, 6);
  const liveFeed = enriched.slice(0, 4);
  const sectionWrap = { width: "min(1240px, calc(100vw - 32px))", margin: "0 auto" } as const;

  return (
    <div style={{ display: "grid", gap: 32, paddingBottom: 28 }}>
      <style>{`
        @keyframes economizaTicker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes economizaPulse { 0%,100% { transform: scale(1); opacity: .7; } 50% { transform: scale(1.18); opacity: 1; } }
      `}</style>
      <section
        style={{
          ...sectionWrap,
          overflow: "hidden",
          borderRadius: 34,
          border: "1px solid rgba(13,52,46,0.08)",
          boxShadow: "0 36px 80px rgba(16,48,43,0.10)",
          background:
            "radial-gradient(circle at 15% 0%, rgba(18,156,132,0.18) 0%, rgba(18,156,132,0) 32%), radial-gradient(circle at 82% 10%, rgba(252,211,110,0.22) 0%, rgba(252,211,110,0) 28%), linear-gradient(180deg, #fbf7ef 0%, #edf3ef 62%, #e5efea 100%)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(90deg, #0c5f54 0%, #10806e 52%, #13a488 100%)",
            color: "white",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              minWidth: "200%",
              whiteSpace: "nowrap",
              animation: "economizaTicker 32s linear infinite",
            }}
          >
            {[...ticker, ...ticker].map((item, index) => (
              <div
                key={`${item}-${index}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 44,
                  padding: "0 20px",
                  fontWeight: 800,
                }}
              >
                <span style={{ opacity: 0.6 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            ...sectionWrap,
            padding: "22px 0 10px",
            display: "flex",
            justifyContent: "space-between",
            gap: 18,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ color: "#12332d", fontWeight: 900, fontSize: 20 }}>Economiza Facil</div>
            <div style={{ color: "rgba(18,51,45,0.64)", fontSize: 14 }}>
              Descubra onde sua lista de compras sai mais barata.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <a
              href="#comparar-lista"
              style={{ color: "#17362f", textDecoration: "none", fontWeight: 800 }}
            >
              Como funciona
            </a>
            <a
              href="#cta-final"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 56,
                padding: "0 22px",
                borderRadius: 18,
                background: "linear-gradient(135deg, #0f6f60 0%, #11a288 100%)",
                color: "white",
                textDecoration: "none",
                fontWeight: 900,
                boxShadow: "0 24px 48px rgba(15,111,96,0.22)",
              }}
            >
              Comparar minha lista
            </a>
          </div>
        </div>

        <div
          style={{
            ...sectionWrap,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
            gap: 26,
            padding: "clamp(28px, 6vw, 74px) 0 clamp(28px, 6vw, 56px)",
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: 22 }}>
            <span
              style={{
                display: "inline-flex",
                width: "fit-content",
                minHeight: 34,
                padding: "0 14px",
                alignItems: "center",
                borderRadius: 999,
                background: "rgba(15,111,94,0.10)",
                color: "#0d6f5e",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Comparacao comercial para o mercado real
            </span>
            <h1
              style={{
                margin: 0,
                color: "#122b26",
                fontSize: "clamp(3.4rem, 8vw, 6.8rem)",
                lineHeight: 0.9,
                letterSpacing: -2.8,
                maxWidth: 820,
              }}
            >
              Descubra onde sua lista de compras sai mais barata
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: 680,
                color: "rgba(18,43,38,0.74)",
                fontSize: "clamp(1.05rem, 2vw, 1.22rem)",
                lineHeight: 1.75,
              }}
            >
              Compare ofertas reais entre mercados da sua regiao e economize antes de sair de casa.
              O Economiza Facil cruza preco, mercado, recencia e sinais de economia para transformar
              uma lista comum em uma decisao muito mais clara.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href="#cta-final"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 58,
                  padding: "0 22px",
                  borderRadius: 18,
                  background: "linear-gradient(135deg, #0f6f60 0%, #11a288 100%)",
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 900,
                  boxShadow: "0 24px 48px rgba(15,111,96,0.22)",
                }}
              >
                Comparar minha lista
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 58,
                  padding: "0 22px",
                  borderRadius: 18,
                  background: "rgba(255,255,255,0.82)",
                  color: "#16332e",
                  textDecoration: "none",
                  fontWeight: 900,
                  border: "1px solid rgba(16,50,45,0.10)",
                }}
              >
                Falar no WhatsApp
              </a>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {["Lista completa, nao item isolado", "Mercados reais da base", "Leitura de economia em segundos"].map((label) => (
                <span
                  key={label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 36,
                    padding: "0 14px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.72)",
                    border: "1px solid rgba(23,58,52,0.08)",
                    color: "#1a413a",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              {[
                { label: "Ofertas conectadas", value: hasConnectionError ? "offline" : String(enriched.filter((offer) => offer.price > 0).length) },
                { label: "Mercados monitorados", value: hasConnectionError ? "..." : String(marketsLoaded || marketBoard.length) },
                { label: "Economia potencial", value: `${Math.max(0, ...enriched.map((offer) => offer.savingsPercent))}%`, dark: true },
              ].map((item) => (
                <article
                  key={item.label}
                  style={{
                    padding: 18,
                    borderRadius: 24,
                    background: item.dark ? "rgba(19,77,68,0.92)" : "rgba(255,255,255,0.82)",
                    color: item.dark ? "white" : "#122b26",
                    border: "1px solid rgba(17,52,47,0.08)",
                  }}
                >
                  <div style={{ color: item.dark ? "rgba(255,255,255,0.70)" : "rgba(17,52,47,0.58)", fontSize: 13, fontWeight: 700 }}>
                    {item.label}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>{item.value}</div>
                </article>
              ))}
            </div>
          </div>
          <div
            style={{
              position: "relative",
              padding: 22,
              borderRadius: 32,
              background: "linear-gradient(155deg, #0d302b 0%, #124a42 50%, #0c7766 100%)",
              color: "white",
              boxShadow: "0 30px 60px rgba(10,38,35,0.22)",
            }}
          >
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>
                    Radar vivo
                  </div>
                  <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, lineHeight: 1.04 }}>
                    Mercado, preco e economia em uma leitura comercial
                  </div>
                </div>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "#73ffc2",
                    boxShadow: "0 0 0 10px rgba(115,255,194,0.14)",
                    animation: "economizaPulse 2.4s ease-in-out infinite",
                    flexShrink: 0,
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  padding: 18,
                  borderRadius: 26,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 13, fontWeight: 700 }}>
                  Top mercados monitorados agora
                </div>
                {(marketBoard.length
                  ? marketBoard
                  : [{ marketName: "Mercados da regiao", offersCount: 0, bestPrice: 0, regionLabel: "Base em sincronizacao" }]).map((item, index) => (
                  <div
                    key={`${item.marketName}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 14,
                      alignItems: "center",
                      padding: "14px 16px",
                      borderRadius: 18,
                      background: index === 0 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{item.marketName}</div>
                      <div style={{ marginTop: 4, color: "rgba(255,255,255,0.68)", fontSize: 13 }}>
                        {item.offersCount > 0 ? `${item.offersCount} ofertas · ${item.regionLabel}` : item.regionLabel}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>
                      {item.bestPrice > 0 ? formatPrice(item.bestPrice) : "ao vivo"}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 18,
                  borderRadius: 26,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 13, fontWeight: 700 }}>
                  Feed de ofertas
                </div>
                {liveFeed.map((offer) => (
                  <div
                    key={offer.id}
                    style={{
                      display: "grid",
                      gap: 4,
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontWeight: 800 }}>{offer.productName}</span>
                      <span style={{ fontWeight: 900 }}>
                        {offer.price > 0 ? formatPrice(offer.price) : "base ativa"}
                      </span>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 13 }}>
                      {offer.marketName} · {offer.categoryLabel} · {offer.freshnessLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={sectionWrap}>
        <div style={sectionStyle()}>
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            <span style={{ display: "inline-flex", width: "fit-content", padding: "7px 13px", borderRadius: 999, background: "rgba(15,111,94,0.10)", color: "#0d6f5e", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>Comparacoes reais</span>
            <h2 style={{ margin: 0, color: "#112a26", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 0.96, letterSpacing: -1.4 }}>Ofertas, mercados e comparacoes com cara de produto vendavel</h2>
            <p style={{ margin: 0, color: "rgba(17,42,38,0.72)", fontSize: 17, lineHeight: 1.75 }}>A Home agora sai do formato de mini app e passa a mostrar movimento real da base, com sinais de preco, categoria, recencia e economia potencial.</p>
          </div>
          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {(cards.length ? cards : fallbackOffers()).map((offer) => (
              <article key={offer.id} style={{ padding: 20, borderRadius: 24, background: "linear-gradient(180deg, #ffffff 0%, #f7fbf9 100%)", border: "1px solid rgba(16,50,45,0.08)", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <span style={{ display: "inline-flex", minHeight: 28, padding: "0 10px", alignItems: "center", borderRadius: 999, background: "rgba(15,111,94,0.10)", color: "#0f6d61", fontSize: 12, fontWeight: 900 }}>{offer.categoryLabel}</span>
                  <span style={{ color: "rgba(18,51,45,0.54)", fontSize: 12, fontWeight: 700 }}>{offer.freshnessLabel}</span>
                </div>
                <div>
                  <h3 style={{ margin: 0, color: "#112a26", fontSize: 21, lineHeight: 1.12 }}>{offer.productName}</h3>
                  <p style={{ margin: "10px 0 0", color: "rgba(17,42,38,0.70)", lineHeight: 1.6 }}>{offer.marketName} · {offer.regionLabel}</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end" }}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: "#102c28" }}>{offer.price > 0 ? formatPrice(offer.price) : "ao vivo"}</div>
                  <div style={{ color: offer.savingsPercent > 0 ? "#11755f" : "rgba(17,42,38,0.54)", fontWeight: 800 }}>{offer.savingsPercent > 0 ? `${offer.savingsPercent}% de economia` : "preco monitorado"}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={sectionWrap}>
        <div style={sectionStyle("linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(245,250,248,0.94) 100%)")}>
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            <span style={{ display: "inline-flex", width: "fit-content", padding: "7px 13px", borderRadius: 999, background: "rgba(15,111,94,0.10)", color: "#0d6f5e", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>Em alta na sua regiao</span>
            <h2 style={{ margin: 0, color: "#112a26", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 0.96, letterSpacing: -1.4 }}>Onde a base esta mostrando mais oportunidade agora</h2>
          </div>
          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {(regions.length ? regions : [{ regionLabel: "Cobertura em andamento", offersCount: 0, featuredMarket: "Mercados da regiao", bestProduct: "As melhores comparacoes aparecem aqui", bestPrice: 0, bestSavings: 0 }]).map((card) => (
              <article key={card.regionLabel} style={{ padding: 22, borderRadius: 24, background: "#102e29", color: "white", display: "grid", gap: 12, minHeight: 220 }}>
                <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>{card.regionLabel}</div>
                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.04 }}>{card.bestProduct}</div>
                <div style={{ color: "rgba(255,255,255,0.74)", lineHeight: 1.7 }}>{card.featuredMarket}{card.offersCount > 0 ? ` · ${card.offersCount} ofertas conectadas` : " · aguardando volume de ofertas"}</div>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end" }}>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{card.bestPrice > 0 ? formatPrice(card.bestPrice) : "em breve"}</div>
                  <div style={{ color: "#73ffc2", fontWeight: 800 }}>{card.bestSavings > 0 ? `ate ${card.bestSavings}%` : "monitorando"}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section style={sectionWrap}>
        <div style={sectionStyle()}>
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            <span style={{ display: "inline-flex", width: "fit-content", padding: "7px 13px", borderRadius: 999, background: "rgba(15,111,94,0.10)", color: "#0d6f5e", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>Exemplo de comparacao</span>
            <h2 style={{ margin: 0, color: "#112a26", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 0.96, letterSpacing: -1.4 }}>Quando a mesma compra aparece em varios mercados, a economia fica visivel</h2>
          </div>
          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(260px, 0.9fr)", gap: 18 }}>
            <div style={{ overflowX: "auto", borderRadius: 24, border: "1px solid rgba(16,50,45,0.08)", background: "#ffffff", padding: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                <thead><tr>{["Produto", "Melhor mercado", "Preco", "Alternativa", "Economia"].map((label) => <th key={label} style={{ textAlign: "left", padding: "0 0 14px", borderBottom: "1px solid rgba(16,50,45,0.08)", color: "rgba(17,42,38,0.58)", fontSize: 13, fontWeight: 800 }}>{label}</th>)}</tr></thead>
                <tbody>
                  {(comparison.length ? comparison : [{ productName: "Sua comparacao de lista aparece aqui", bestMarket: "Mercado com melhor preco", bestPrice: 0, secondMarket: "Alternativa seguinte", secondPrice: 0, savingsPercent: 0, freshness: "Aguardando base real" }]).map((row) => (
                    <tr key={`${row.productName}-${row.bestMarket}`}>
                      <td style={{ padding: "16px 0", borderBottom: "1px solid rgba(16,50,45,0.08)", fontWeight: 800, color: "#112a26" }}>{row.productName}<div style={{ marginTop: 6, color: "rgba(17,42,38,0.54)", fontSize: 12, fontWeight: 700 }}>{row.freshness}</div></td>
                      <td style={{ padding: "16px 0", borderBottom: "1px solid rgba(16,50,45,0.08)" }}>{row.bestMarket}</td>
                      <td style={{ padding: "16px 0", borderBottom: "1px solid rgba(16,50,45,0.08)", fontWeight: 800 }}>{row.bestPrice > 0 ? formatPrice(row.bestPrice) : "—"}</td>
                      <td style={{ padding: "16px 0", borderBottom: "1px solid rgba(16,50,45,0.08)" }}>{row.secondMarket}{row.secondPrice > 0 ? ` · ${formatPrice(row.secondPrice)}` : ""}</td>
                      <td style={{ padding: "16px 0", borderBottom: "1px solid rgba(16,50,45,0.08)", fontWeight: 900, color: row.savingsPercent > 0 ? "#0f6d61" : "rgba(17,42,38,0.50)" }}>{row.savingsPercent > 0 ? `${row.savingsPercent}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ borderRadius: 24, padding: 22, background: "linear-gradient(180deg, #102f2a 0%, #123d35 100%)", color: "white", display: "grid", gap: 14, alignContent: "start" }}>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>Leitura rapida</div>
              <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 0.98 }}>{comparison.length ? `${comparison[0].savingsPercent}%` : "Lista"}</div>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.75 }}>{comparison.length ? "No topo da base atual, ja existe variacao suficiente para mostrar onde a compra pode render mais." : "Assim que a mesma cesta aparecer em mercados diferentes, esta area passa a mostrar a vantagem de forma automatica."}</p>
              <div style={{ padding: 16, borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.90)", lineHeight: 1.7 }}>O foco do Economiza Facil nao e exibir uma lista de precos solta. O objetivo e vender clareza para decidir melhor a compra inteira.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="comparar-lista" style={sectionWrap}>
        <div style={sectionStyle()}>
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            <span style={{ display: "inline-flex", width: "fit-content", padding: "7px 13px", borderRadius: 999, background: "rgba(15,111,94,0.10)", color: "#0d6f5e", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>Como funciona</span>
            <h2 style={{ margin: 0, color: "#112a26", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 0.96, letterSpacing: -1.4 }}>Uma jornada simples para transformar lista em decisao</h2>
          </div>
          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[{ step: "1", title: "Envie sua lista", text: "Voce informa os itens que quer comprar. O Economiza Facil organiza isso em uma comparacao pronta para decidir." }, { step: "2", title: "Cruzamos os mercados", text: "A base combina ofertas ativas, mercado, categoria, recencia e variacao de preco para montar um radar util." }, { step: "3", title: "Receba a melhor direcao", text: "O resultado aponta onde sua compra tende a sair melhor e mostra as ofertas mais interessantes ao redor." }].map((item) => (
              <article key={item.step} style={{ padding: 22, borderRadius: 24, background: "linear-gradient(180deg, #ffffff 0%, #f6fbf9 100%)", border: "1px solid rgba(16,50,45,0.08)", display: "grid", gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 16, display: "grid", placeItems: "center", background: "linear-gradient(135deg, #0f6f60 0%, #11a288 100%)", color: "white", fontWeight: 900 }}>{item.step}</div>
                <h3 style={{ margin: 0, color: "#112a26", fontSize: 22 }}>{item.title}</h3>
                <p style={{ margin: 0, color: "rgba(17,42,38,0.70)", lineHeight: 1.75 }}>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={sectionWrap}>
        <div style={sectionStyle("linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(247,250,249,0.96) 100%)")}>
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            <span style={{ display: "inline-flex", width: "fit-content", padding: "7px 13px", borderRadius: 999, background: "rgba(15,111,94,0.10)", color: "#0d6f5e", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>Beneficios</span>
            <h2 style={{ margin: 0, color: "#112a26", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 0.96, letterSpacing: -1.4 }}>Uma landing para vender valor antes mesmo do WhatsApp voltar ao modo total</h2>
          </div>
          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {[{ title: "Comparacao centrada na lista inteira", text: "O valor nao esta em achar um produto isolado mais barato. O foco e descobrir qual mercado faz mais sentido para a compra completa." }, { title: "Decisao antes de sair de casa", text: "Voce economiza tempo, reduz compra por impulso e ganha clareza para decidir melhor com antecedencia." }, { title: "Leitura simples e comercial", text: "A experiencia foi desenhada para ser direta: sinais claros de preco, recencia, mercado e economia potencial." }, { title: "Base pronta para operacao real", text: "A landing conversa com a base do projeto e abre espaco para escalar sem reinventar a estrutura." }].map((item) => (
              <article key={item.title} style={{ padding: 22, borderRadius: 24, background: "#ffffff", border: "1px solid rgba(16,50,45,0.08)", display: "grid", gap: 12 }}>
                <h3 style={{ margin: 0, color: "#112a26", fontSize: 22 }}>{item.title}</h3>
                <p style={{ margin: 0, color: "rgba(17,42,38,0.70)", lineHeight: 1.75 }}>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="cta-final" style={sectionWrap}>
        <div style={{ ...sectionStyle("linear-gradient(145deg, #0f2925 0%, #0f5f54 50%, #12a286 100%)"), color: "white", display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(280px, 0.85fr)", gap: 20 }}>
          <div style={{ display: "grid", gap: 16, alignContent: "center" }}>
            <span style={{ display: "inline-flex", width: "fit-content", minHeight: 34, padding: "0 14px", alignItems: "center", borderRadius: 999, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>CTA final</span>
            <h2 style={{ margin: 0, fontSize: "clamp(2.2rem, 4vw, 3.7rem)", lineHeight: 0.98, letterSpacing: -1.8 }}>Compare sua lista antes de fazer a compra no escuro</h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.82)", lineHeight: 1.8, fontSize: 17 }}>O Economiza Facil foi criado para responder com clareza uma pergunta simples: em qual mercado a compra inteira faz mais sentido hoje.</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 58, padding: "0 22px", borderRadius: 18, background: "rgba(255,255,255,0.88)", color: "#16332e", textDecoration: "none", fontWeight: 900 }}>Falar no WhatsApp</a>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 58, padding: "0 22px", borderRadius: 18, background: "linear-gradient(135deg, #0f6f60 0%, #11a288 100%)", color: "white", textDecoration: "none", fontWeight: 900, border: "1px solid rgba(255,255,255,0.14)" }}>Comparar minha lista</a>
            </div>
          </div>
          <div style={{ display: "grid", gap: 14, alignContent: "start", padding: 18, borderRadius: 24, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}>
            <div style={{ fontWeight: 800, color: "rgba(255,255,255,0.80)" }}>Espaco reservado para QR Code</div>
            <div style={{ display: "grid", placeItems: "center", minHeight: 240, borderRadius: 22, border: "2px dashed rgba(255,255,255,0.24)", background: "rgba(255,255,255,0.06)", textAlign: "center", padding: 24, color: "rgba(255,255,255,0.78)", lineHeight: 1.7, fontWeight: 700 }}>QR Code oficial do canal<br />entra aqui na proxima etapa</div>
          </div>
        </div>
      </section>

      <section style={sectionWrap}>
        <div style={sectionStyle()}>
          <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
            <span style={{ display: "inline-flex", width: "fit-content", padding: "7px 13px", borderRadius: 999, background: "rgba(15,111,94,0.10)", color: "#0d6f5e", fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>FAQ</span>
            <h2 style={{ margin: 0, color: "#112a26", fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: 0.96, letterSpacing: -1.4 }}>Perguntas curtas para reduzir atrito na conversao</h2>
          </div>
          <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
            {[{ q: "O Economiza Facil ja esta operando em modo real?", a: "A proposta comercial e a estrutura de comparacao ja estao prontas. O canal principal de WhatsApp segue em fase final de retomada operacional." }, { q: "Preciso baixar aplicativo?", a: "Nao. O MVP foi pensado para ser leve, com entrada simples e experiencia comercial direta." }, { q: "Os dados mostrados na landing sao reais?", a: hasConnectionError || !cards.length ? "Quando a base nao responde ou ainda nao tem volume suficiente, a landing troca para um fallback visual sem quebrar a experiencia." : "Sim. Sempre que a base estiver disponivel, a landing mostra produto, preco, mercado, categoria, recencia e sinais de economia usando a propria colecao de ofertas." }].map((item) => (
              <article key={item.q} style={{ padding: 18, borderRadius: 22, background: "#ffffff", border: "1px solid rgba(16,50,45,0.08)" }}>
                <h3 style={{ margin: 0, color: "#112a26", fontSize: 19 }}>{item.q}</h3>
                <p style={{ margin: "10px 0 0", color: "rgba(17,42,38,0.70)", lineHeight: 1.75 }}>{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ ...sectionWrap, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "6px 4px 0", color: "rgba(17,42,38,0.60)", fontSize: 14 }}>
        <div>
          <div style={{ color: "#12332d", fontWeight: 900 }}>Economiza Facil</div>
          <div style={{ marginTop: 6 }}>Descubra onde sua lista de compras sai mais barata.</div>
          <div style={{ marginTop: 10 }}>
            <Link
              to="/privacidade"
              style={{
                color: "#0f6f60",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              Política de Privacidade
            </Link>
          </div>
        </div>
        <div style={{ maxWidth: 360, lineHeight: 1.7 }}>
          {isLoading ? "Sincronizando a base para exibir ofertas reais na landing." : "Landing comercial conectada a ofertas reais da base quando disponiveis, com fallback elegante quando a colecao ainda nao entrega volume suficiente."}
        </div>
      </footer>
    </div>
  );
}
