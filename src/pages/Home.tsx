import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { useEffect, useState, useMemo } from "react";
import { 
  Search, 
  MapPin, 
  MessageSquare, 
  TrendingUp, 
  ShieldCheck, 
  Zap, 
  ChevronRight,
  Smartphone,
  CheckCircle2,
  Navigation,
  ArrowRight,
  ShoppingCart
} from "lucide-react";

import { db } from "../firebase";
import { adminColors } from "./admin/adminStyles";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const WHATSAPP_URL: string = import.meta.env.VITE_WHATSAPP_ENTRY_URL || "";
const SEARCH_LIMIT = 5;

type OfferCard = {
  id: string;
  productName: string;
  marketName: string;
  price: number;
  regionLabel: string;
  updatedAtLabel: string;
  savingsPercent?: number;
};

export default function Home() {
  const [offers, setOffers] = useState<OfferCard[]>([]);
  const [recentOffers, setRecentOffers] = useState<OfferCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLocation, setUserLocation] = useState("Detectando sua localização...");
  const [searchCount, setSearchCount] = useState(() => {
    return Number(localStorage.getItem("ef_search_count") || 0);
  });
  const [isLimitReached, setIsLimitReached] = useState(false);

  // 1. Carregamento de Dados Iniciais
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const q = query(collection(db, "offers"), orderBy("createdAt", "desc"), limit(20));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];

        const normalized = data.map(item => ({
          id: item.id,
          productName: item.productName || item.name || "Produto",
          marketName: item.marketName || "Mercado",
          price: item.price || 0,
          regionLabel: item.city || item.neighborhood || "Sua região",
          updatedAtLabel: "há pouco",
          savingsPercent: Math.floor(Math.random() * 20) + 5 // Simulação para o MVP
        }));

        setOffers(normalized.slice(0, 6));
        setRecentOffers(normalized.slice(0, 10));
      } catch (err) {
        console.error("Erro ao carregar ofertas:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchInitialData();
  }, []);

  // 2. Lógica de Geolocalização
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {
          // No futuro, usar um serviço de geocoding reverso aqui.
          // Por enquanto, simulamos a detecção do bairro baseado na latitude/longitude
          setUserLocation("Você está em Vitória, ES");
        },
        () => setUserLocation("Brasil - Selecione sua região")
      );
    }
  }, []);

  // 3. Lógica de Busca com Limite
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (searchCount >= SEARCH_LIMIT) {
      setIsLimitReached(true);
      return;
    }

    const nextCount = searchCount + 1;
    setSearchCount(nextCount);
    localStorage.setItem("ef_search_count", String(nextCount));
    
    // Aqui filtraria os resultados locais...
    console.log("Pesquisando por:", searchQuery);
  };

  const tickerItems = useMemo(() => {
    return recentOffers.map(o => `${o.productName} por ${formatCurrency(o.price)} em ${o.marketName} · `);
  }, [recentOffers]);

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "#FFFFFF", 
      color: "#1F2937", 
      fontFamily: "'Inter', sans-serif" 
    }}>
      {/* 1. TOP TICKER (Carrinho Cheio Style) */}
      <div style={{ 
        background: adminColors.primary, 
        color: "white", 
        padding: "8px 0", 
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontSize: "13px",
        fontWeight: 600
      }}>
        <div style={{ 
          display: "inline-block", 
          animation: "ticker 40s linear infinite",
          paddingLeft: "100%"
        }}>
          {tickerItems.join(" ")} {tickerItems.join(" ")}
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* 2. NAVBAR */}
      <nav style={{ 
        maxWidth: "1200px", 
        margin: "0 auto", 
        padding: "24px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ 
            background: adminColors.primary, 
            width: 36, 
            height: 36, 
            borderRadius: 8, 
            display: "grid", 
            placeItems: "center" 
          }}>
            <Navigation size={20} color="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px" }}>EconomizaFácil<span style={{color: adminColors.primary}}>.ia</span></span>
        </div>

        <div style={{ display: "flex", gap: 32, alignItems: "center" }} className="desktop-menu">
          <a href="#demo" style={{ textDecoration: "none", color: "#4B5563", fontWeight: 500 }}>Como funciona</a>
          <a href="#offers" style={{ textDecoration: "none", color: "#4B5563", fontWeight: 500 }}>Preços do dia</a>
          <a 
            href={WHATSAPP_URL} 
            target="_blank" 
            rel="noreferrer"
            style={{ 
              background: "#1F2937", 
              color: "white", 
              padding: "10px 20px", 
              borderRadius: 99, 
              textDecoration: "none", 
              fontWeight: 600,
              fontSize: 14
            }}
          >
            Entrar no WhatsApp
          </a>
        </div>
      </nav>

      {/* 3. HERO SECTION (ELITE) */}
      <section style={{ 
        maxWidth: "1200px", 
        margin: "80px auto 140px", 
        padding: "0 20px",
        textAlign: "center"
      }}>
        <div style={{ 
          display: "inline-flex", 
          alignItems: "center", 
          gap: 8, 
          background: "#F3F4F6", 
          padding: "6px 16px", 
          borderRadius: 99,
          fontSize: 13,
          fontWeight: 600,
          color: "#4B5563",
          marginBottom: 32
        }}>
          <MapPin size={14} color={adminColors.primary} />
          {userLocation}
        </div>

        <h1 style={{ 
          fontSize: "clamp(2.5rem, 6vw, 4.5rem)", 
          fontWeight: 900, 
          lineHeight: 1.1, 
          letterSpacing: "-2px",
          marginBottom: 24,
          animation: "fadeIn 0.6s ease-out"
        }}>
          O mercado está caro? <br />
          Nós <span style={{ color: adminColors.primary }}>encontramos</span> o menor preço.
        </h1>

        <p style={{ 
          fontSize: "20px", 
          color: "#6B7280", 
          maxWidth: "700px", 
          margin: "0 auto 48px",
          lineHeight: 1.6
        }}>
          Compare agora preços reais de Assaí, Carrefour, BH e muito mais. <br /> 
          Pesquise o produto que você precisa e economize na hora.
        </p>

        {/* SEARCH BAR (PREMIUM) */}
        <form 
          onSubmit={handleSearch}
          style={{ 
            maxWidth: "700px", 
            margin: "0 auto",
            position: "relative",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.08)"
          }}
        >
          <input 
            type="text" 
            placeholder="Ex: Arroz Tio João 5kg, Cerveja Heineken..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: "100%", 
              padding: "24px 32px 24px 60px", 
              borderRadius: "100px", 
              border: "1px solid #E5E7EB",
              fontSize: "18px",
              outline: "none",
              background: "white"
            }}
          />
          <Search 
            size={24} 
            color="#9CA3AF" 
            style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)" }} 
          />
          <button 
            type="submit"
            style={{ 
              position: "absolute", 
              right: 8, 
              top: 8, 
              bottom: 8, 
              background: adminColors.primary, 
              color: "white", 
              border: "none",
              borderRadius: "99px",
              padding: "0 28px",
              fontWeight: 700,
              cursor: "pointer"
            }}>
            Buscar
          </button>
        </form>

        <div style={{ marginTop: 24, fontSize: 13, color: "#9CA3AF" }}>
          Pesquisas disponíveis hoje: <strong>{SEARCH_LIMIT - searchCount}</strong> de {SEARCH_LIMIT}
        </div>
      </section>

      {/* 4. OFFERS GRID (ELITE CARDS) */}
      <section id="offers" style={{ 
        background: "#F9FAFB", 
        padding: "100px 20px",
        borderTop: "1px solid #F3F4F6"
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 48 }}>
            <div>
              <h2 style={{ fontSize: 32, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Em alta na sua região</h2>
              <p style={{ color: "#6B7280" }}>Baseado nas melhores ofertas encontradas na última hora.</p>
            </div>
            <a href="#" style={{ color: adminColors.primary, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              Ver todas <ChevronRight size={18} />
            </a>
          </div>

          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
            gap: 24 
          }}>
            {isLoading ? (
              [1,2,3].map(i => <div key={i} style={{ height: 350, background: "#E5E7EB", borderRadius: 24 }} />)
            ) : (
              offers.map(o => (
                <div key={o.id} style={{ 
                  background: "white", 
                  borderRadius: 24, 
                  padding: 24, 
                  border: "1px solid #F3F4F6",
                  transition: "transform 0.2s",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16
                }} onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-5px)"}
                   onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}>
                  
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: adminColors.primary, background: "#EDE9FE", padding: "4px 10px", borderRadius: 6 }}>
                      {o.savingsPercent}% de economia
                    </div>
                    <Star />
                  </div>

                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: "#111827" }}>{o.productName}</h3>
                    <p style={{ color: "#6B7280", fontSize: 14 }}>{o.marketName} · {o.regionLabel}</p>
                  </div>

                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "end" }}>
                    <div>
                      <div style={{ fontSize: 14, color: "#9CA3AF" }}>Melhor preço</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#111827" }}>{formatCurrency(o.price)}</div>
                    </div>
                    <div style={{ 
                      background: "#F3F4F6", 
                      width: 44, 
                      height: 44, 
                      borderRadius: 12, 
                      display: "grid", 
                      placeItems: "center" 
                    }}>
                      <ShoppingCart size={20} color="#1F2937" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 5. WHATSAPP MOCKUP SECTION (THE HOOK) */}
      <section id="demo" style={{ 
        padding: "120px 20px", 
        background: "radial-gradient(circle at 10% 20%, #F9FAFB 0%, #EDE9FE 100%)",
        overflow: "hidden"
      }}>
        <div style={{ 
          maxWidth: "1200px", 
          margin: "0 auto", 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", 
          gap: 60,
          alignItems: "center"
        }}>
          <div>
             <span style={{ 
               color: adminColors.primary, 
               fontWeight: 800, 
               fontSize: 14, 
               textTransform: "uppercase", 
               letterSpacing: 2,
               display: "block",
               marginBottom: 16
             }}>
               WhatsApp First
             </span>
             <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)", fontWeight: 900, lineHeight: 1.1, marginBottom: 24 }}>
               Sua lista de compras, <br /> simplificada.
             </h2>
             <div style={{ display: "grid", gap: 24, marginBottom: 40 }}>
               <FeatureItem 
                 icon={<CheckCircle2 color={adminColors.primary} />} 
                 title="Envie por texto ou áudio" 
                 desc="Mande o que você precisa comprar e nossa IA faz o resto." 
               />
               <FeatureItem 
                 icon={<TrendingUp color={adminColors.primary} />} 
                 title="Comparação Inteligente" 
                 desc="Analisamos todos os mercados próximos para achar o melhor preço total." 
               />
               <FeatureItem 
                 icon={<ShieldCheck color={adminColors.primary} />} 
                 title="Grátis para sempre" 
                 desc="Economia real na palma da sua mão sem pagar nada por isso." 
               />
             </div>
             <a 
              href={WHATSAPP_URL}
              style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 12, 
                background: "#25D366", 
                color: "white", 
                padding: "20px 40px", 
                borderRadius: 20, 
                fontSize: 18, 
                fontWeight: 800, 
                textDecoration: "none",
                boxShadow: "0 20px 40px rgba(37, 211, 102, 0.25)"
              }}
             >
               <MessageSquare size={24} /> Começar Econonizar agora
             </a>
          </div>

          <div style={{ position: "relative" }}>
             <img 
               src="/assets/whatsapp-mockup.png" 
               alt="Mockup do WhatsApp" 
               style={{ 
                 width: "100%", 
                 maxWidth: 500, 
                 height: "auto", 
                 display: "block", 
                 margin: "0 auto",
                 filter: "drop-shadow(0 50px 80px rgba(0,0,0,0.15))"
               }} 
             />
             <div style={{ 
               position: "absolute", 
               top: "20%", 
               right: "-10%", 
               background: "white", 
               padding: "16px 24px", 
               borderRadius: 20, 
               boxShadow: "0 20px 40px rgba(0,0,0,0.05)",
               animation: "economizaPulse 3s infinite"
             }}>
                <div style={{ fontWeight: 800, color: "#1F2937", display: "flex", alignItems: "center", gap: 8 }}>
                  <Zap size={16} color={adminColors.primary} fill={adminColors.primary} /> Economia de R$ 42,50!
                </div>
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Sugestão: Compra no Assaí</div>
             </div>
          </div>
        </div>
      </section>

      {/* 6. WHATSAPP BARRIER MODAL */}
      {isLimitReached && (
        <div style={{ 
          position: "fixed", 
          inset: 0, 
          background: "rgba(15, 17, 23, 0.95)", 
          display: "grid", 
          placeItems: "center", 
          zIndex: 1000,
          padding: 20,
          backdropFilter: "blur(8px)"
        }}>
          <div style={{ 
            background: "white", 
            padding: "48px 40px", 
            borderRadius: 32, 
            maxWidth: 500, 
            width: "100%", 
            textAlign: "center",
            animation: "fadeIn 0.4s ease-out"
          }}>
            <div style={{ 
              width: 80, 
              height: 80, 
              background: "#EDE9FE", 
              borderRadius: "50%", 
              display: "grid", 
              placeItems: "center", 
              margin: "0 auto 32px" 
            }}>
              <Smartphone size={40} color={adminColors.primary} />
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 16 }}>Opa! Você atingiu o limite web.</h2>
            <p style={{ color: "#6B7280", fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
              Para garantir que tenhamos sempre as melhores ofertas atualizadas para você, o acesso completo e ilimitado é feito diretamente pelo nosso assistente no WhatsApp.
            </p>
            <a 
              href={WHATSAPP_URL}
              style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                gap: 12, 
                background: adminColors.primary, 
                color: "white", 
                padding: "18px", 
                borderRadius: 18, 
                fontSize: 16, 
                fontWeight: 800, 
                textDecoration: "none",
                width: "100%"
              }}
            >
              Continuar no WhatsApp Gratuitamente <ArrowRight size={20} />
            </a>
            <button 
              onClick={() => {
                setSearchCount(0);
                localStorage.setItem("ef_search_count", "0");
                setIsLimitReached(false);
              }}
              style={{ 
                marginTop: 20, 
                background: "none", 
                border: "none", 
                color: "#9CA3AF", 
                fontSize: 13, 
                cursor: "pointer",
                textDecoration: "underline"
              }}>
              Reiniciar testes (Debug Mode)
            </button>
          </div>
        </div>
      )}

      {/* 7. FOOTER */}
      <footer style={{ padding: "80px 20px", textAlign: "center", borderTop: "1px solid #F3F4F6", color: "#9CA3AF", fontSize: 14 }}>
        <p>© 2026 EconomizaFácil.ia · Inteligência a serviço da sua economia.</p>
      </footer>
    </div>
  );
}

function Star() {
    return <div style={{ color: "#FBBF24" }}><CheckCircle2 size={20} /></div>;
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 800, color: "#111827", fontSize: 18 }}>{title}</div>
        <div style={{ color: "#6B7280", fontSize: 15, lineHeight: 1.5, marginTop: 4 }}>{desc}</div>
      </div>
    </div>
  );
}
