import { useEffect, useState } from "react";
import {
  offerQueueService,
  type OfferQueueItem,
} from "../../services/admin/OfferQueueService";
import { adminMvpService, type MarketRecord } from "../../services/admin/AdminMvpService";
import AdminNav from "./AdminNav";
import {
  adminBadgeStyle,
  adminButtonStyle,
  adminDangerButtonStyle,
  adminInputStyle,
  adminPanelStyle,
  adminSecondaryButtonStyle,
  adminShellStyle,
  adminTopbarStyle,
  adminActionsRowStyle,
} from "./adminStyles";

export default function AdminQueue() {
  const [items, setItems] = useState<OfferQueueItem[]>([]);
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Estado para edição rápida no modal
  const [editingItem, setEditingItem] = useState<OfferQueueItem | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [pendingItems, marketItems] = await Promise.all([
        offerQueueService.listPending(),
        adminMvpService.listMarkets(),
      ]);
      setItems(pendingItems);
      setMarkets(marketItems);
    } catch (error) {
      console.error("[AdminQueue] load error", error);
      setFeedback("Erro ao carregar a fila.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleApprove(item: OfferQueueItem) {
    setProcessingId(item.id);
    setFeedback("");
    try {
      // Tenta encontrar o mercado pelo nome se não tiver marketId (extraído por IA)
      let marketId = (item as any).marketId;
      if (!marketId && markets.length > 0) {
        const found = markets.find(m => 
          m.nome.toLowerCase().includes(item.marketName.toLowerCase()) ||
          item.marketName.toLowerCase().includes(m.nome.toLowerCase())
        );
        if (found) marketId = found.id;
      }

      await offerQueueService.approve(item.id, item, "admin", {
          // Garante que o marketId correto seja passado se encontrado
          marketId
      } as any);
      setFeedback("Item aprovado e publicado!");
      await loadData();
    } catch (error) {
      console.error("[AdminQueue] approve error", error);
      setFeedback("Erro ao aprovar item.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(itemId: string) {
    const reason = window.prompt("Motivo da rejeição (opcional):");
    if (reason === null) return; // cancelado

    setProcessingId(itemId);
    setFeedback("");
    try {
      await offerQueueService.reject(itemId, "admin", reason);
      setFeedback("Item rejeitado.");
      await loadData();
    } catch (error) {
      console.error("[AdminQueue] reject error", error);
      setFeedback("Erro ao rejeitar item.");
    } finally {
      setProcessingId(null);
    }
  }

  function formatCurrency(val: number) {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  }

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={adminTopbarStyle}>
            <div style={{ display: "grid", gap: 8 }}>
              <span style={adminBadgeStyle("amber")}>Ingestão</span>
              <h1 style={{ margin: 0, color: "#17332f" }}>Fila de Moderação</h1>
              <p style={{ margin: 0, color: "rgba(23,51,47,0.74)", lineHeight: 1.7 }}>
                Itens extraídos automaticamente de fotos enviadas por usuários. 
                Revise, ajuste os dados e publique na base oficial.
              </p>
            </div>
          </div>
          <AdminNav />
        </div>
      </section>

      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={adminTopbarStyle}>
            <h2 style={{ margin: 0, color: "#17332f" }}>Itens Pendentes</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {feedback && <span style={{ color: "#0f6d61", fontWeight: 700 }}>{feedback}</span>}
                <span style={adminBadgeStyle("neutral")}>
                  {loading ? "Carregando..." : `${items.length} pendentes`}
                </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => (
              <article
                key={item.id}
                style={{
                  padding: 20,
                  borderRadius: 18,
                  background: "white",
                  border: "1px solid rgba(15,53,47,0.08)",
                  display: "grid",
                  gap: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
                }}
              >
                <div style={adminTopbarStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 900, fontSize: 18, color: "#15322d" }}>{item.productName}</span>
                        <span style={adminBadgeStyle(item.imageSource === 'tabloid' ? 'amber' : 'green')}>
                            {item.imageSource === 'tabloid' ? 'Tabloide' : item.imageSource === 'price_tag' ? 'Etiqueta' : 'Ingestão'}
                        </span>
                    </div>
                    <div style={{ marginTop: 8, color: "rgba(21,50,45,0.72)", lineHeight: 1.6 }}>
                      <strong style={{ color: "#0f7b6c" }}>{item.marketName}</strong>
                      {item.brand && ` · ${item.brand}`}
                      {item.unit && ` · ${item.unit}`}
                      {item.category && ` · ${item.category}`}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900, fontSize: 22, color: "#0f6d61" }}>{formatCurrency(item.price)}</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 4 }}>
                        Enviado por: {item.submittedBy}
                    </div>
                  </div>
                </div>

                <div style={adminActionsRowStyle}>
                  <button 
                    type="button" 
                    style={adminButtonStyle} 
                    onClick={() => handleApprove(item)}
                    disabled={!!processingId}
                  >
                    {processingId === item.id ? "Aprovando..." : "Aprovar e Publicar"}
                  </button>
                  <button 
                    type="button" 
                    style={adminSecondaryButtonStyle} 
                    onClick={() => setEditingItem(item)} // TODO: Implementar modal de edição rápida
                    disabled={!!processingId}
                  >
                    Ajustar Dados
                  </button>
                  <button 
                    type="button" 
                    style={adminDangerButtonStyle} 
                    onClick={() => handleReject(item.id)}
                    disabled={!!processingId}
                  >
                    Rejeitar
                  </button>
                </div>
              </article>
            ))}

            {!items.length && !loading ? (
              <div style={{ 
                  padding: "40px 20px", 
                  textAlign: "center", 
                  color: "rgba(23,51,47,0.5)",
                  background: "rgba(17,52,47,0.03)",
                  borderRadius: 18,
                  border: "1px dashed rgba(17,52,47,0.1)"
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🌴</div>
                Nada para moderar por aqui. Bom descanso!
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Basic Modal Overlay for Editing (Quick implementation) */}
      {editingItem && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", 
          alignItems: "center", justifyContent: "center", zIndex: 1000,
          padding: 20
        }}>
           <div style={{ ...adminPanelStyle, width: "100%", maxWidth: 500, display: "grid", gap: 16 }}>
              <h3 style={{ margin: 0 }}>Ajustar Item da Fila</h3>
              <div style={{ display: "grid", gap: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Produto</label>
                  <input style={adminInputStyle} value={editingItem.productName} 
                         onChange={e => setEditingItem({...editingItem, productName: e.target.value})} />
                  
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Mercado (Texto Extraído)</label>
                  <input style={adminInputStyle} value={editingItem.marketName} 
                         onChange={e => setEditingItem({...editingItem, marketName: e.target.value})} />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>Preço</label>
                        <input type="number" step="0.01" style={adminInputStyle} value={editingItem.price} 
                             onChange={e => setEditingItem({...editingItem, price: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>Unidade</label>
                        <input style={adminInputStyle} value={editingItem.unit || ""} 
                             onChange={e => setEditingItem({...editingItem, unit: e.target.value})} />
                      </div>
                  </div>
              </div>
              <div style={adminActionsRowStyle}>
                  <button style={adminButtonStyle} onClick={() => {
                      setItems(items.map(i => i.id === editingItem.id ? editingItem : i));
                      setEditingItem(null);
                  }}>Confirmar Alterações Temporárias</button>
                  <button style={adminSecondaryButtonStyle} onClick={() => setEditingItem(null)}>Cancelar</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
