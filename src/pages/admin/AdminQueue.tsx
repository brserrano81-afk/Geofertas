import { useEffect, useState } from "react";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Image as ImageIcon, 
  User, 
  MapPin, 
  Edit3,
  Search,
  AlertCircle,
  X
} from "lucide-react";

import {
  offerQueueService,
  type OfferQueueItem,
} from "../../services/admin/OfferQueueService";
import { adminMvpService, type MarketRecord } from "../../services/admin/AdminMvpService";
import {
  adminBadgeStyle,
  adminButtonStyle,
  adminColors,
  adminInputStyle,
  adminPanelStyle,
  adminShellStyle,
} from "./adminStyles";

export default function AdminQueue() {
  const [items, setItems] = useState<OfferQueueItem[]>([]);
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Estado para edição rápida no painel lateral
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

  const filteredItems = items.filter(item => 
    item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.marketName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  async function handleApprove(item: OfferQueueItem) {
    setProcessingId(item.id);
    setFeedback("");
    try {
      let marketId = (item as any).marketId;
      if (!marketId && markets.length > 0) {
        const found = markets.find(m => 
          m.nome.toLowerCase().includes(item.marketName.toLowerCase()) ||
          item.marketName.toLowerCase().includes(m.nome.toLowerCase())
        );
        if (found) marketId = found.id;
      }

      await offerQueueService.approve(item.id, item, "admin", { marketId } as any);
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
    if (reason === null) return;

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
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Fila de Moderação</h1>
          <p style={{ margin: '4px 0 0', color: adminColors.textSecondary, fontSize: 15 }}>
            Revise e valide os itens extraídos por IA das fotos dos usuários.
          </p>
        </div>
        <div style={adminBadgeStyle('amber')}>
           <Clock size={14} style={{ marginRight: 6 }} />
           {items.length} itens pendentes
        </div>
      </div>

      {feedback && (
        <div style={{ 
          ...adminBadgeStyle(feedback.includes('Erro') ? "red" : "green"), 
          padding: '12px 20px',
          width: 'fit-content'
        }}>
          {feedback}
        </div>
      )}

      {/* ── List & Filters ───────────────────────────────────── */}
      <section style={adminPanelStyle}>
        <div style={{ position: 'relative', marginBottom: 24, maxWidth: 400 }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
          <input 
            style={{ ...adminInputStyle, paddingLeft: 40 }} 
            placeholder="Buscar na fila..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: adminColors.textSecondary }}>Carregando fila...</div>
          ) : filteredItems.map((item) => (
            <article
              key={item.id}
              style={{
                padding: '20px',
                borderRadius: 16,
                background: '#F9FAFB',
                border: `1px solid ${adminColors.border}`,
                display: 'flex',
                gap: 24,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Photo Placeholder/Preview */}
              <div style={{
                width: 120,
                height: 120,
                borderRadius: 12,
                background: '#E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9CA3AF',
                flexShrink: 0
              }}>
                <ImageIcon size={32} />
              </div>

              {/* Data */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: adminColors.text }}>{item.productName}</h3>
                  <span style={adminBadgeStyle(item.imageSource === 'tabloid' ? 'amber' : 'purple')}>
                    {item.imageSource === 'tabloid' ? 'Tabloide' : 'Etiqueta/Foto'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Mercado (IA)</label>
                    <div style={{ fontSize: 14, fontWeight: 600, color: adminColors.text, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={14} color={adminColors.primary} />
                      {item.marketName}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Preço</label>
                    <div style={{ fontSize: 18, fontWeight: 800, color: adminColors.primary }}>{formatCurrency(item.price)}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Enviado por</label>
                    <div style={{ fontSize: 14, color: adminColors.textSecondary }}>{item.submittedBy}</div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                <button 
                  onClick={() => handleApprove(item)}
                  disabled={!!processingId}
                  style={{ ...adminButtonStyle, minHeight: 40, width: 160 }}
                >
                  <CheckCircle size={18} style={{ marginRight: 8 }} />
                  Aprovar
                </button>
                <button 
                   onClick={() => setEditingItem(item)}
                   disabled={!!processingId}
                   style={{ ...adminInputStyle, height: 40, width: 160, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Edit3 size={18} />
                  Ajustar
                </button>
                <button 
                   onClick={() => handleReject(item.id)}
                   disabled={!!processingId}
                   style={{ background: 'transparent', border: 'none', color: adminColors.error, fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}
                >
                  Rejeitar
                </button>
              </div>
            </article>
          ))}

          {!filteredItems.length && !loading && (
             <div style={{ padding: 60, textAlign: 'center', color: adminColors.textSecondary, background: `${adminColors.primary}05`, borderRadius: 16, border: `1px dashed ${adminColors.border}` }}>
                <AlertCircle size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                <div style={{ fontSize: 18, fontWeight: 700 }}>Nada na fila!</div>
                <div style={{ fontSize: 14 }}>Tudo limpo por enquanto.</div>
             </div>
          )}
        </div>
      </section>

      {/* ── Adjustment Side Panel ──────────────────────────── */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 500,
          height: '100vh',
          background: '#fff',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.1)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ padding: '24px 32px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Ajustar Dados Extraídos</h2>
            <button onClick={() => setEditingItem(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: adminColors.textSecondary }}>
              <X size={24} />
            </button>
          </div>

          <div style={{ padding: 32, display: 'grid', gap: 24, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Produto</label>
              <input
                style={adminInputStyle}
                value={editingItem.productName}
                onChange={e => setEditingItem({ ...editingItem, productName: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Mercado (Texto Extraído)</label>
              <input
                style={adminInputStyle}
                value={editingItem.marketName}
                onChange={e => setEditingItem({ ...editingItem, marketName: e.target.value })}
              />
              <span style={{ fontSize: 11, color: adminColors.textSecondary }}>O sistema tentará encontrar um mercado correspondente na aprovação.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Preço (R$)</label>
                    <input
                        type="number"
                        step="0.01"
                        style={adminInputStyle}
                        value={editingItem.price}
                        onChange={e => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                    />
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Unidade</label>
                    <input
                        style={adminInputStyle}
                        value={editingItem.unit || ""}
                        onChange={e => setEditingItem({ ...editingItem, unit: e.target.value })}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Categoria</label>
                <input
                    style={adminInputStyle}
                    value={editingItem.category || ""}
                    onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 12 }}>
              <button 
                onClick={() => {
                  setItems(items.map(i => i.id === editingItem.id ? editingItem : i));
                  setEditingItem(null);
                }}
                style={{ ...adminButtonStyle, flex: 1 }}
              >
                Confirmar Ajustes
              </button>
              <button onClick={() => setEditingItem(null)} style={{ ...adminInputStyle, width: 'auto', padding: '0 24px' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div 
          onClick={() => setEditingItem(null)}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15,17,23,0.4)', zIndex: 90 }} 
        />
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
