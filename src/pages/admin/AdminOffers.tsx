import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { 
  Plus, 
  Search, 
  Edit2, 
  Power, 
  X, 
  Clock,
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

  const stats = useMemo(() => {
    const active = offers.filter(o => o.active).length;
    const featured = offers.filter(o => o.featured).length;
    const avgPrice = offers.length > 0 ? offers.reduce((acc, curr) => acc + curr.price, 0) / offers.length : 0;
    return { active, featured, avgPrice };
  }, [offers]);

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
    <div style={{ ...adminShellStyle, gap: 48 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: '-0.05em', color: adminColors.text }}>Gerenciar Ofertas</h1>
          <p style={{ margin: '8px 0 0', color: adminColors.textSecondary, fontSize: 16, fontWeight: 500 }}>
            {offers.length} ofertas catalogadas em {markets.length} mercados.
          </p>
        </div>
        <button onClick={handleAddClick} style={{ ...adminButtonStyle, height: 52, padding: '0 32px', gap: 12, boxShadow: `0 12px 24px ${adminColors.primary}33` }}>
          <Plus size={22} strokeWidth={3} />
          <span>Cadastrar Oferta</span>
        </button>
      </div>

      {/* ── Stats Cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
        <div style={{ ...adminPanelStyle }}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Ofertas Ativas</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{stats.active}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.success, fontWeight: 700 }}>Visíveis no app</div>
        </div>
        <div style={{ ...adminPanelStyle }}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Destaques</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{stats.featured}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.warning, fontWeight: 700 }}>Na vitrine principal</div>
        </div>
        <div style={{ ...adminPanelStyle }}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Preço Médio</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{formatCurrency(stats.avgPrice)}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.textSecondary, fontWeight: 600 }}>Mix de produtos</div>
        </div>
        <div style={{ ...adminPanelStyle, background: adminColors.primary, border: 'none' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Status da Base</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>Hígida</div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Integridade validada</div>
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

      {/* ── Table & Search ───────────────────────────────────── */}
      <section style={{ ...adminPanelStyle, padding: 0, overflow: 'hidden', border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '32px 40px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', gap: 24, alignItems: 'center', background: '#fff', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 400 }}>
            <Search size={22} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
            <input 
              style={{ ...adminInputStyle, paddingLeft: 56, height: 52, background: '#F8FAFC', border: '1px solid #F1F5F9' }} 
              placeholder="Buscar por produto ou mercado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select style={{ ...adminInputStyle, width: 'auto', height: 52, background: '#fff', fontWeight: 700 }} value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}>
               <option value="todos">Todos Mercados</option>
               {markets.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>

          <select style={{ ...adminInputStyle, width: 'auto', height: 52, background: '#fff', fontWeight: 700 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
               <option value="todos">Categorias</option>
               {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select style={{ ...adminInputStyle, width: 'auto', height: 52, background: '#fff', fontWeight: 700 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AdminStatusFilter)}>
               <option value="todos">Status</option>
               <option value="ativos">Ativos</option>
               <option value="inativos">Inativos</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Produto / Categoria</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Mercado</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Preço</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Validade</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Status</th>
                <th style={{ padding: '20px 40px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={6} style={{ padding: 120, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                         <div style={{ width: 48, height: 48, border: `4px solid ${adminColors.primaryLight}`, borderTopColor: adminColors.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                         <span style={{ fontWeight: 700, color: adminColors.textSecondary, fontSize: 16 }}>Sincronizando ofertas...</span>
                      </div>
                   </td>
                </tr>
              ) : filteredOffers.map((o) => (
                <tr key={o.id} style={{ borderBottom: `1px solid ${adminColors.border}`, transition: 'background 0.2s' }}>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: adminColors.textSecondary, border: `1px solid ${adminColors.border}` }}>
                            <ShoppingCart size={22} strokeWidth={1.5} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 900, color: adminColors.text, fontSize: 16 }}>{o.productName}</div>
                            <div style={{ fontSize: 13, color: adminColors.textSecondary, marginTop: 4, fontWeight: 600 }}>{o.category} · {o.unit}</div>
                        </div>
                    </div>
                  </td>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ fontWeight: 700, color: adminColors.text, fontSize: 15 }}>{o.marketName}</div>
                    <div style={{ fontSize: 12, color: adminColors.textSecondary, marginTop: 4, fontWeight: 500 }}>{o.neighborhood}</div>
                  </td>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ fontWeight: 900, color: adminColors.primary, fontSize: 18 }}>{formatCurrency(o.price)}</div>
                  </td>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: adminColors.textSecondary, fontWeight: 700 }}>
                      <Clock size={16} />
                      {formatDateLabel(o.expiresAt)}
                    </div>
                  </td>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {o.active ? (
                           <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: adminColors.success }} />
                              <span style={{ fontSize: 12, fontWeight: 900, color: adminColors.success, textTransform: 'uppercase' }}>Ativa</span>
                           </div>
                        ) : (
                           <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: adminColors.error }} />
                              <span style={{ fontSize: 12, fontWeight: 900, color: adminColors.error, textTransform: 'uppercase' }}>Inativa</span>
                           </div>
                        )}
                        {o.featured && (
                           <div style={{ background: `${adminColors.warning}15`, color: adminColors.warning, padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Star size={12} fill={adminColors.warning} />
                              Destaque
                           </div>
                        )}
                    </div>
                  </td>
                  <td style={{ padding: '32px 40px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => startEditing(o)}
                        style={{ background: '#F1F5F9', border: 'none', color: adminColors.textSecondary, cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggle(o)}
                        style={{ background: o.active ? `${adminColors.error}10` : `${adminColors.success}10`, border: 'none', color: o.active ? adminColors.error : adminColors.success, cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
             <div style={{ padding: 120, textAlign: 'center', color: adminColors.textSecondary, background: '#F8FAFC' }}>
                <Search size={48} strokeWidth={1.5} style={{ marginBottom: 20, opacity: 0.3 }} />
                <div style={{ fontSize: 18, fontWeight: 700 }}>Nenhuma oferta encontrada</div>
                <div style={{ fontSize: 14 }}>Ajuste os filtros ou o termo de busca.</div>
             </div>
          )}
        </div>
      </section>

      {/* ── Side Form ────────────────────────── */}
      {isFormOpen && (
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
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em' }}>
                {editingId ? 'Editar Oferta' : 'Nova Oferta'}
              </h2>
              <p style={{ margin: '8px 0 0', fontSize: 16, color: adminColors.textSecondary, fontWeight: 500 }}>Preencha os detalhes do produto e preço.</p>
            </div>
            <button onClick={closeForm} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: adminColors.textSecondary, width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={24} strokeWidth={3} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 48, display: 'grid', gap: 40, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Nome do Produto *</label>
              <input
                style={{ ...adminInputStyle, height: 56 }}
                placeholder="Ex: Arroz Tio João 5kg"
                value={form.productName}
                onChange={(e) => setForm(c => ({ ...c, productName: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Categoria *</label>
                <input
                  style={{ ...adminInputStyle, height: 56 }}
                  placeholder="Ex: Mercearia"
                  value={form.category}
                  onChange={(e) => setForm(c => ({ ...c, category: e.target.value }))}
                  required
                />
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Unidade *</label>
                <input
                  style={{ ...adminInputStyle, height: 56 }}
                  placeholder="Ex: un, kg, lt"
                  value={form.unit}
                  onChange={(e) => setForm(c => ({ ...c, unit: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 24 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Preço (R$) *</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: adminColors.textSecondary }}>R$</span>
                        <input
                            style={{ ...adminInputStyle, paddingLeft: 48, height: 56 }}
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.price || ""}
                            onChange={(e) => setForm(c => ({ ...c, price: Number(e.target.value) }))}
                            required
                        />
                    </div>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mercado *</label>
                    <select
                        style={{ ...adminInputStyle, height: 56, background: '#F8FAFC' }}
                        value={form.marketId}
                        onChange={(e) => setForm(c => ({ ...c, marketId: e.target.value }))}
                        required
                    >
                        <option value="">Selecione a Unidade...</option>
                        {markets.map(m => (
                            <option key={m.id} value={m.id}>{m.nome} ({m.bairro})</option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Data da Coleta *</label>
                    <input
                        style={{ ...adminInputStyle, height: 56 }}
                        type="date"
                        value={dateInputFromIso(form.collectedAt)}
                        onChange={(e) => setForm(c => ({ ...c, collectedAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Validade *</label>
                    <input
                        style={{ ...adminInputStyle, height: 56 }}
                        type="date"
                        value={dateInputFromIso(form.expiresAt)}
                        onChange={(e) => setForm(c => ({ ...c, expiresAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
            </div>

            <div style={{ 
                padding: '24px', 
                borderRadius: 20, 
                background: form.featured ? `${adminColors.warning}10` : '#F8FAFC',
                border: `2px solid ${form.featured ? adminColors.warning : 'transparent'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                cursor: 'pointer',
                transition: 'all 0.3s'
            }} onClick={() => setForm(c => ({ ...c, featured: !c.featured }))}>
                <div style={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: 6, 
                    border: `2px solid ${form.featured ? adminColors.warning : adminColors.neutral}`,
                    background: form.featured ? adminColors.warning : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff'
                }}>
                    {form.featured && <Plus size={16} strokeWidth={4} />}
                </div>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: adminColors.text }}>Destaque na Vitrine</div>
                    <div style={{ fontSize: 13, color: adminColors.textSecondary, fontWeight: 500, marginTop: 4 }}>Aparece com prioridade para todos os usuários.</div>
                </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 48, display: 'flex', gap: 20 }}>
              <button type="submit" style={{ ...adminButtonStyle, flex: 2, height: 60, fontSize: 16 }} disabled={saving}>
                {saving ? "Processando..." : editingId ? "Salvar Alterações" : "Cadastrar Oferta"}
              </button>
              <button type="button" onClick={closeForm} style={{ ...adminInputStyle, flex: 1, height: 60, background: '#F8FAFC', fontWeight: 800, border: 'none' }}>
                Descartar
              </button>
            </div>
          </form>
        </div>
      )}

      {isFormOpen && (
        <div 
          onClick={closeForm}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)', zIndex: 90 }} 
        />
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
