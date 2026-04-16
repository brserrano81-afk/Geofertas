import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { 
  Tag, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Power, 
  X, 
  Calendar,
  DollarSign,
  ShoppingCart,
  Star
} from "lucide-react";

import {
  adminMvpService,
  createEmptyOfferInput,
  dateInputFromIso,
  formatCurrency,
  formatDateLabel,
  normalizeOfferInput,
  offerToInput,
  type AdminStatusFilter,
  type MarketRecord,
  type OfferInput,
  type OfferRecord,
} from "../../services/admin/AdminMvpService";
import {
  adminBadgeStyle,
  adminButtonStyle,
  adminColors,
  adminInputStyle,
  adminPanelStyle,
  adminShellStyle,
} from "./adminStyles";

export default function AdminOffers() {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [form, setForm] = useState<OfferInput>(createEmptyOfferInput());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [marketFilter, setMarketFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>("todos");

  async function loadData() {
    const [offerItems, marketItems] = await Promise.all([
      adminMvpService.listOffers(),
      adminMvpService.listMarkets(),
    ]);
    setOffers(offerItems);
    setMarkets(marketItems);
  }

  useEffect(() => {
    loadData()
      .catch((error) => {
        console.error("[AdminOffers] load error", error);
        setFeedback("Não foi possível carregar as ofertas.");
      })
      .finally(() => setLoading(false));
  }, []);

  const categoryOptions = useMemo(
    () => Array.from(new Set(offers.map((offer) => offer.category).filter(Boolean))).sort(),
    [offers],
  );

  const filteredOffers = useMemo(() => {
    return offers.filter((offer) => {
      if (marketFilter !== "todos" && offer.marketId !== marketFilter) return false;
      if (categoryFilter !== "todos" && offer.category !== categoryFilter) return false;
      if (statusFilter === "ativos" && !offer.active) return false;
      if (statusFilter === "inativos" && offer.active) return false;
      if (searchTerm) {
        const low = searchTerm.toLowerCase();
        return offer.productName.toLowerCase().includes(low) || offer.marketName.toLowerCase().includes(low);
      }
      return true;
    }).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  }, [offers, marketFilter, categoryFilter, statusFilter, searchTerm]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === form.marketId) || null,
    [form.marketId, markets],
  );

  function handleAddClick() {
    setForm(createEmptyOfferInput());
    setEditingId(null);
    setIsFormOpen(true);
    setFeedback("");
  }

  function startEditing(record: OfferRecord) {
    setForm(offerToInput(record));
    setEditingId(record.id);
    setIsFormOpen(true);
    setFeedback("");
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      if (!form.marketId) {
        setFeedback("Por favor, selecione um mercado.");
        setSaving(false);
        return;
      }
      const normalized = normalizeOfferInput(form, selectedMarket);
      if (editingId) {
        await adminMvpService.updateOffer(editingId, normalized);
        setFeedback("Oferta atualizada com sucesso.");
      } else {
        await adminMvpService.createOffer(normalized);
        setFeedback("Oferta cadastrada com sucesso.");
      }

      setIsFormOpen(false);
      await loadData();
    } catch (error) {
      console.error("[AdminOffers] save error", error);
      setFeedback("Erro ao salvar oferta.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(record: OfferRecord) {
    try {
      await adminMvpService.toggleOfferStatus(record);
      await loadData();
    } catch (error) {
      console.error("[AdminOffers] toggle error", error);
      setFeedback("Erro ao atualizar status.");
    }
  }

  return (
    <div style={adminShellStyle}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Ofertas</h1>
          <p style={{ margin: '4px 0 0', color: adminColors.textSecondary, fontSize: 15 }}>
            Gerencie os produtos coletados e seus preços ativos.
          </p>
        </div>
        <button onClick={handleAddClick} style={{ ...adminButtonStyle, gap: 8 }}>
          <Plus size={18} />
          Nova Oferta
        </button>
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

      {/* ── Table & Filters ──────────────────────────────────── */}
      <section style={adminPanelStyle}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 250 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
            <input 
              style={{ ...adminInputStyle, paddingLeft: 40 }} 
              placeholder="Buscar por produto ou mercado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select style={{ ...adminInputStyle, width: 'auto' }} value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}>
               <option value="todos">Todos os Mercados</option>
               {markets.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>

          <select style={{ ...adminInputStyle, width: 'auto' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
               <option value="todos">Todas as Categorias</option>
               {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select style={{ ...adminInputStyle, width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AdminStatusFilter)}>
               <option value="todos">Todos os Status</option>
               <option value="ativos">Somente Ativos</option>
               <option value="inativos">Somente Inativos</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminColors.border}` }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Produto</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Mercado</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Preço</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Validade</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: adminColors.textSecondary }}>Carregando ofertas...</td>
                </tr>
              ) : filteredOffers.map((o) => (
                <tr key={o.id} style={{ borderBottom: `1px solid ${adminColors.border}`, transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: adminColors.background, display: 'flex', alignItems: 'center', justifyContent: 'center', color: adminColors.textSecondary }}>
                            <ShoppingCart size={16} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, color: adminColors.text }}>{o.productName}</div>
                            <div style={{ fontSize: 12, color: adminColors.textSecondary }}>{o.category} · {o.unit}</div>
                        </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px', color: adminColors.textSecondary, fontSize: 14 }}>
                    <div style={{ fontWeight: 500 }}>{o.marketName}</div>
                    <div style={{ fontSize: 11 }}>{o.neighborhood}</div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 800, color: adminColors.primary }}>{formatCurrency(o.price)}</div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: adminColors.textSecondary }}>
                      <Clock size={14} />
                      {formatDateLabel(o.expiresAt)}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {o.active ? <span style={adminBadgeStyle("green")}>Ativa</span> : <span style={adminBadgeStyle("red")}>Inativa</span>}
                        {o.featured && <span style={adminBadgeStyle("amber")} title="Destaque"><Star size={10} fill="#D97706" /></span>}
                    </div>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => startEditing(o)}
                        style={{ background: 'transparent', border: 'none', color: adminColors.textSecondary, cursor: 'pointer', padding: 6 }}
                        title="Editar"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggle(o)}
                        style={{ background: 'transparent', border: 'none', color: o.active ? adminColors.error : adminColors.success, cursor: 'pointer', padding: 6 }}
                        title={o.active ? "Inativar" : "Ativar"}
                      >
                        <Power size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredOffers.length && !loading && (
             <div style={{ padding: 60, textAlign: 'center', color: adminColors.textSecondary }}>
                Nenhuma oferta corresponde aos filtros.
             </div>
          )}
        </div>
      </section>

      {/* ── Side Form (Optsolv Style) ────────────────────────── */}
      {isFormOpen && (
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
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {editingId ? 'Editar Oferta' : 'Nova Oferta'}
            </h2>
            <button onClick={closeForm} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: adminColors.textSecondary }}>
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 32, display: 'grid', gap: 24, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Produto *</label>
              <input
                style={adminInputStyle}
                placeholder="Ex: Arroz Tio João 5kg"
                value={form.productName}
                onChange={(e) => setForm(c => ({ ...c, productName: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Categoria *</label>
                <input
                  style={adminInputStyle}
                  placeholder="Ex: Mercearia"
                  value={form.category}
                  onChange={(e) => setForm(c => ({ ...c, category: e.target.value }))}
                  required
                />
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Unidade *</label>
                <input
                  style={adminInputStyle}
                  placeholder="Ex: un, kg, lt"
                  value={form.unit}
                  onChange={(e) => setForm(c => ({ ...c, unit: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Preço (R$) *</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: adminColors.textSecondary }}>R$</span>
                        <input
                            style={{ ...adminInputStyle, paddingLeft: 36 }}
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.price || ""}
                            onChange={(e) => setForm(c => ({ ...c, price: Number(e.target.value) }))}
                            required
                        />
                    </div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Mercado *</label>
                    <select
                        style={adminInputStyle}
                        value={form.marketId}
                        onChange={(e) => setForm(c => ({ ...c, marketId: e.target.value }))}
                        required
                    >
                        <option value="">Selecione...</option>
                        {markets.map(m => (
                            <option key={m.id} value={m.id}>{m.nome} ({m.bairro})</option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Data da Coleta *</label>
                    <input
                        style={adminInputStyle}
                        type="date"
                        value={dateInputFromIso(form.collectedAt)}
                        onChange={(e) => setForm(c => ({ ...c, collectedAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Validade da Oferta *</label>
                    <input
                        style={adminInputStyle}
                        type="date"
                        value={dateInputFromIso(form.expiresAt)}
                        onChange={(e) => setForm(c => ({ ...c, expiresAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
            </div>

            <div style={{ 
                padding: '16px', 
                borderRadius: 12, 
                background: form.featured ? `${adminColors.warning}10` : '#F9FAFB',
                border: `1px solid ${form.featured ? adminColors.warning : adminColors.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer'
            }} onClick={() => setForm(c => ({ ...c, featured: !c.featured }))}>
                <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => setForm(c => ({ ...c, featured: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: adminColors.text }}>Destaque na Vitrine</div>
                    <div style={{ fontSize: 12, color: adminColors.textSecondary }}>Aparece na página inicial para os usuários.</div>
                </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 12 }}>
              <button type="submit" style={{ ...adminButtonStyle, flex: 1 }} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Cadastrar Oferta"}
              </button>
              <button type="button" onClick={closeForm} style={{ ...adminInputStyle, width: 'auto', padding: '0 24px' }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {isFormOpen && (
        <div 
          onClick={closeForm}
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
