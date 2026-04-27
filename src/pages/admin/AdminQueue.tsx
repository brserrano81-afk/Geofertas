import { useEffect, useMemo, useState } from "react";
import { 
  CheckCircle, 
  Clock, 
  Image as ImageIcon, 
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

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.marketName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

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
      setFeedback("Item aprovado e publicado com sucesso!");
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
    <div style={{ ...adminShellStyle, gap: 48 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: '-0.05em', color: adminColors.text }}>Fila de Moderação</h1>
          <p style={{ margin: '8px 0 0', color: adminColors.textSecondary, fontSize: 16, fontWeight: 500 }}>
            Valide ofertas extraídas por IA antes de publicá-las no catálogo.
          </p>
        </div>
        <div style={{ ...adminBadgeStyle('amber'), padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 800 }}>
           <Clock size={16} style={{ marginRight: 10 }} />
           {items.length} itens pendentes
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
         <div style={{ ...adminPanelStyle }}>
            <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Aguardando Revisão</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{items.length}</div>
            <div style={{ marginTop: 12, fontSize: 13, color: adminColors.warning, fontWeight: 700 }}>Atenção requerida</div>
         </div>
         <div style={{ ...adminPanelStyle }}>
            <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Tempo Médio (IA)</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>1.2s</div>
            <div style={{ marginTop: 12, fontSize: 13, color: adminColors.success, fontWeight: 700 }}>Performance otimizada</div>
         </div>
         <div style={{ ...adminPanelStyle, background: adminColors.primary, border: 'none' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Acurácia da IA</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>94.2%</div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Baseado em 1.2k revisões</div>
         </div>
      </div>

      {feedback && (
        <div style={{ 
          ...adminBadgeStyle(feedback.includes('Erro') ? "red" : "green"), 
          padding: '16px 32px',
          width: 'fit-content',
          borderRadius: 14,
          boxShadow: '0 8px 20px rgba(0,0,0,0.05)',
          fontSize: 14
        }}>
          {feedback}
        </div>
      )}

      {/* ── Filters & Search ────────────────────────────────── */}
      <section style={{ ...adminPanelStyle, padding: 0, overflow: 'hidden', border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '32px 40px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', gap: 32, alignItems: 'center', background: '#fff' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 600 }}>
            <Search size={22} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
            <input 
              style={{ ...adminInputStyle, paddingLeft: 56, height: 52, background: '#F8FAFC', border: '1px solid #F1F5F9' }} 
              placeholder="Buscar por produto ou mercado na fila..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div style={{ padding: '32px 40px', display: 'grid', gap: 24 }}>
          {loading ? (
            <div style={{ padding: 120, textAlign: 'center' }}>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 48, height: 48, border: `4px solid ${adminColors.primaryLight}`, borderTopColor: adminColors.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontWeight: 700, color: adminColors.textSecondary, fontSize: 16 }}>Sincronizando fila de moderação...</span>
               </div>
            </div>
          ) : filteredItems.map((item: OfferQueueItem) => (
            <article
              key={item.id}
              style={{
                padding: '32px',
                borderRadius: 20,
                background: '#fff',
                border: `1px solid ${adminColors.border}`,
                display: 'flex',
                gap: 32,
                transition: 'all 0.2s',
                animation: 'fadeIn 0.5s ease-out forwards'
              }}
            >
              {/* Photo Preview */}
              <div style={{
                width: 140,
                height: 140,
                borderRadius: 16,
                background: '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: adminColors.neutral,
                flexShrink: 0,
                border: `1px solid ${adminColors.border}`
              }}>
                <ImageIcon size={40} strokeWidth={1.5} />
              </div>

              {/* Data */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: adminColors.text }}>{item.productName}</h3>
                  <span style={{ ...adminBadgeStyle(item.imageSource === 'tabloid' ? 'amber' : 'purple'), padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                    {item.imageSource === 'tabloid' ? 'Tabloide' : 'Etiqueta/Foto'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>Mercado (IA)</label>
                    <div style={{ fontSize: 15, fontWeight: 700, color: adminColors.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={18} color={adminColors.primary} />
                      {item.marketName}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>Preço</label>
                    <div style={{ fontSize: 24, fontWeight: 900, color: adminColors.primary }}>{formatCurrency(item.price)}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>Enviado por</label>
                    <div style={{ fontSize: 15, color: adminColors.textSecondary, fontWeight: 600 }}>{item.submittedBy}</div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
                <button 
                  onClick={() => handleApprove(item)}
                  disabled={!!processingId}
                  style={{ ...adminButtonStyle, height: 48, width: 180, gap: 10 }}
                >
                  <CheckCircle size={20} strokeWidth={2.5} />
                  Aprovar Item
                </button>
                <button 
                   onClick={() => setEditingItem(item)}
                   disabled={!!processingId}
                   style={{ ...adminInputStyle, height: 48, width: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fff', border: '1px solid #E2E8F0', fontWeight: 700 }}
                >
                  <Edit3 size={18} />
                  Ajustar Dados
                </button>
                <button 
                   onClick={() => handleReject(item.id)}
                   disabled={!!processingId}
                   style={{ background: 'transparent', border: 'none', color: adminColors.error, fontSize: 14, fontWeight: 800, cursor: 'pointer', textAlign: 'center', marginTop: 4 }}
                >
                  Rejeitar Oferta
                </button>
              </div>
            </article>
          ))}

          {!filteredItems.length && !loading && (
             <div style={{ padding: 120, textAlign: 'center', color: adminColors.textSecondary, background: '#F8FAFC', borderRadius: 24, border: `2px dashed ${adminColors.border}` }}>
                <AlertCircle size={56} strokeWidth={1.5} style={{ marginBottom: 20, color: adminColors.neutral }} />
                <div style={{ fontSize: 22, fontWeight: 900, color: adminColors.text }}>Fila Vazia</div>
                <div style={{ fontSize: 16, fontWeight: 500, marginTop: 8 }}>Tudo limpo! Nenhuma oferta aguardando moderação.</div>
             </div>
          )}
        </div>
      </section>

      {/* ── Adjustment Side Panel (Side Drawer) ──────────────────────────── */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 580,
          height: '100vh',
          background: '#fff',
          boxShadow: '-30px 0 80px rgba(0,0,0,0.2)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{ padding: '40px 48px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em' }}>Ajustar Extração</h2>
              <p style={{ margin: '8px 0 0', fontSize: 16, color: adminColors.textSecondary, fontWeight: 500 }}>Corrija erros de leitura da IA.</p>
            </div>
            <button onClick={() => setEditingItem(null)} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: adminColors.textSecondary, width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={24} strokeWidth={3} />
            </button>
          </div>

          <div style={{ padding: 48, display: 'grid', gap: 40, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Nome do Produto</label>
              <input
                style={{ ...adminInputStyle, height: 56 }}
                value={editingItem.productName}
                onChange={e => setEditingItem({ ...editingItem, productName: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mercado (Texto Extraído)</label>
              <input
                style={{ ...adminInputStyle, height: 56 }}
                value={editingItem.marketName}
                onChange={e => setEditingItem({ ...editingItem, marketName: e.target.value })}
              />
              <span style={{ fontSize: 12, color: adminColors.textSecondary, fontWeight: 500 }}>O sistema tentará encontrar um mercado correspondente na aprovação.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Preço de Venda (R$)</label>
                    <input
                        type="number"
                        step="0.01"
                        style={{ ...adminInputStyle, height: 56 }}
                        value={editingItem.price}
                        onChange={e => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                    />
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Unidade</label>
                    <input
                        style={{ ...adminInputStyle, height: 56 }}
                        placeholder="Ex: un, kg, pct"
                        value={editingItem.unit || ""}
                        onChange={e => setEditingItem({ ...editingItem, unit: e.target.value })}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Categoria Proposta</label>
                <input
                    style={{ ...adminInputStyle, height: 56 }}
                    value={editingItem.category || ""}
                    onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 40, display: 'flex', gap: 20 }}>
              <button 
                onClick={() => {
                  setItems(items.map(i => i.id === editingItem.id ? editingItem : i));
                  setEditingItem(null);
                }}
                style={{ ...adminButtonStyle, flex: 2, height: 60, fontSize: 16 }}
              >
                Salvar Alterações
              </button>
              <button onClick={() => setEditingItem(null)} style={{ ...adminInputStyle, flex: 1, height: 60, background: '#F8FAFC', fontWeight: 800, border: 'none' }}>
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div 
          onClick={() => setEditingItem(null)}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)', zIndex: 90 }} 
        />
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
