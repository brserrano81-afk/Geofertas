import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { 
  Plus, 
  Search, 
  MapPin, 
  Edit2, 
  Power, 
  X
} from "lucide-react";

import {
  adminMvpService,
  createEmptyMarketInput,
  marketToInput,
  normalizeMarketInput,
  type MarketInput,
  type MarketRecord,
} from "../../services/admin/AdminMvpService";
import {
  adminBadgeStyle,
  adminButtonStyle,
  adminColors,
  adminInputStyle,
  adminPanelStyle,
  adminShellStyle,
} from "./adminStyles";

export default function AdminMarkets() {
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [form, setForm] = useState<MarketInput>(createEmptyMarketInput());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const total = markets.length;
    const active = markets.filter(m => m.ativo).length;
    const networks = new Set(markets.map(m => m.rede)).size;
    return { total, active, networks };
  }, [markets]);

  const filteredMarkets = useMemo(() => {
    let result = [...markets];
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      result = result.filter(m => 
        m.nome.toLowerCase().includes(low) || 
        m.rede.toLowerCase().includes(low) ||
        m.bairro.toLowerCase().includes(low)
      );
    }
    return result.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [markets, searchTerm]);

  async function loadMarkets() {
    const items = await adminMvpService.listMarkets();
    setMarkets(items);
  }

  useEffect(() => {
    loadMarkets()
      .catch((error) => {
        console.error("[AdminMarkets] load error", error);
        setFeedback("Não foi possível carregar os mercados.");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleAddClick() {
    setForm(createEmptyMarketInput());
    setEditingId(null);
    setIsFormOpen(true);
    setFeedback("");
  }

  function startEditing(record: MarketRecord) {
    setForm(marketToInput(record));
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
      const normalized = normalizeMarketInput(form);
      if (editingId) {
        await adminMvpService.updateMarket(editingId, normalized);
        setFeedback("Mercado atualizado com sucesso.");
      } else {
        await adminMvpService.createMarket(normalized);
        setFeedback("Mercado cadastrado com sucesso.");
      }

      setIsFormOpen(false);
      await loadMarkets();
    } catch (error) {
      console.error("[AdminMarkets] save error", error);
      setFeedback("Erro ao salvar mercado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(record: MarketRecord) {
    try {
      await adminMvpService.toggleMarketStatus(record);
      await loadMarkets();
    } catch (error) {
      console.error("[AdminMarkets] toggle error", error);
      setFeedback("Erro ao atualizar status.");
    }
  }

  return (
    <div style={{ ...adminShellStyle, gap: 48 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: '-0.05em', color: adminColors.text }}>Gerenciar Mercados</h1>
          <p style={{ margin: '8px 0 0', color: adminColors.textSecondary, fontSize: 16, fontWeight: 500 }}>
            {stats.total} unidades físicas cadastradas na plataforma.
          </p>
        </div>
        <button onClick={handleAddClick} style={{ ...adminButtonStyle, gap: 12, height: 52, padding: '0 32px', boxShadow: `0 12px 24px ${adminColors.primary}33` }}>
          <Plus size={22} strokeWidth={3} />
          <span>Cadastrar Unidade</span>
        </button>
      </div>

      {/* ── Stats Cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
        <div style={stats.total > 0 ? { ...adminPanelStyle, animation: 'fadeIn 0.5s ease-out forwards' } : adminPanelStyle}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Total Unidades</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{stats.total}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.success, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
             <Plus size={14} strokeWidth={3} /> 8 este mês
          </div>
        </div>
        <div style={stats.total > 0 ? { ...adminPanelStyle, animation: 'fadeIn 0.5s ease-out 0.1s forwards', opacity: 0 } : adminPanelStyle}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Status Ativo</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{stats.active}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.textSecondary, fontWeight: 600 }}>{stats.total > 0 ? ((stats.active/stats.total)*100).toFixed(0) : 0}% da base</div>
        </div>
        <div style={stats.total > 0 ? { ...adminPanelStyle, animation: 'fadeIn 0.5s ease-out 0.2s forwards', opacity: 0 } : adminPanelStyle}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Redes Logadas</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{stats.networks}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.textSecondary, fontWeight: 600 }}>Crescimento orgânico</div>
        </div>
        <div style={stats.total > 0 ? { ...adminPanelStyle, background: adminColors.primary, border: 'none', animation: 'fadeIn 0.5s ease-out 0.3s forwards', opacity: 0 } : { ...adminPanelStyle, background: adminColors.primary, border: 'none' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Status Cloud</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>100%</div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Sincronização ativa</div>
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
        <div style={{ padding: '32px 40px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', gap: 32, alignItems: 'center', background: '#fff' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 600 }}>
            <Search size={22} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
            <input 
              style={{ ...adminInputStyle, paddingLeft: 56, height: 52, background: '#F8FAFC', border: '1px solid #F1F5F9' }} 
              placeholder="Filtre por nome, rede ou bairro do mercado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
             <button style={{ ...adminInputStyle, width: 'auto', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', gap: 12, background: '#fff', fontWeight: 700 }}>
                Filtros Avançados
                <ChevronDown size={16} />
             </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Unidade Operacional</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Rede Associada</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Localização</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Status</th>
                <th style={{ padding: '20px 40px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={5} style={{ padding: 120, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                         <div style={{ width: 48, height: 48, border: `4px solid ${adminColors.primaryLight}`, borderTopColor: adminColors.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                         <span style={{ fontWeight: 700, color: adminColors.textSecondary, fontSize: 16 }}>Sincronizando base de dados...</span>
                      </div>
                   </td>
                </tr>
              ) : filteredMarkets.map((m) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${adminColors.border}`, transition: 'all 0.2s' }}>
                  <td style={{ padding: '24px 40px' }}>
                    <div style={{ fontWeight: 900, color: adminColors.text, fontSize: 16 }}>{m.nome}</div>
                    <div style={{ fontSize: 12, color: adminColors.textSecondary, marginTop: 6, fontWeight: 600 }}>UUID: {m.id.substring(0, 12)}</div>
                  </td>
                  <td style={{ padding: '24px 40px' }}>
                    <span style={{ 
                      padding: '6px 14px', 
                      borderRadius: 8, 
                      background: adminColors.primaryLight, 
                      color: adminColors.primary, 
                      fontSize: 13, 
                      fontWeight: 800 
                    }}>
                      {m.rede}
                    </span>
                  </td>
                  <td style={{ padding: '24px 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: adminColors.textSecondary, fontWeight: 600 }}>
                      <MapPin size={18} color={adminColors.neutral} />
                      {m.bairro} · {m.cidade}
                    </div>
                  </td>
                  <td style={{ padding: '24px 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                       <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.ativo ? adminColors.success : adminColors.neutral, boxShadow: m.ativo ? `0 0 12px ${adminColors.success}80` : 'none' }} />
                       <span style={{ fontSize: 15, fontWeight: 800, color: m.ativo ? adminColors.text : adminColors.textSecondary }}>
                         {m.ativo ? "Operando" : "Pausado"}
                       </span>
                    </div>
                  </td>
                  <td style={{ padding: '24px 40px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => startEditing(m)}
                        style={{ background: '#fff', border: '1px solid #E2E8F0', color: adminColors.textSecondary, cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggle(m)}
                        style={{ background: m.ativo ? '#FEF2F2' : '#F0FDF4', border: 'none', color: m.ativo ? adminColors.error : adminColors.success, cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Power size={18} strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Side Drawer ────────────────────────── */}
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
                {editingId ? 'Editar Unidade' : 'Nova Unidade'}
              </h2>
              <p style={{ margin: '8px 0 0', fontSize: 16, color: adminColors.textSecondary, fontWeight: 500 }}>Configuração de dados do mercado.</p>
            </div>
            <button onClick={closeForm} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: adminColors.textSecondary, width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={24} strokeWidth={3} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '48px', display: 'grid', gap: 40, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Título Público</label>
              <input
                style={{ ...adminInputStyle, height: 56 }}
                placeholder="Ex: Assaí - Serra Centro"
                value={form.nome}
                onChange={(e) => setForm(c => ({ ...c, nome: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Grupo Econômico / Rede</label>
              <input
                style={{ ...adminInputStyle, height: 56 }}
                placeholder="Ex: Assaí Atacadista"
                value={form.rede}
                onChange={(e) => setForm(c => ({ ...c, rede: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cidade</label>
                <input
                  style={{ ...adminInputStyle, height: 56 }}
                  placeholder="Ex: Vitória"
                  value={form.cidade}
                  onChange={(e) => setForm(c => ({ ...c, cidade: e.target.value }))}
                  required
                />
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Estado (UF)</label>
                <input
                  style={{ ...adminInputStyle, height: 56 }}
                  placeholder="ES"
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => setForm(c => ({ ...c, uf: e.target.value.toUpperCase() }))}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Bairro de Referência</label>
              <input
                style={{ ...adminInputStyle, height: 56 }}
                placeholder="Ex: Jardim Camburi"
                value={form.bairro}
                onChange={(e) => setForm(c => ({ ...c, bairro: e.target.value }))}
                required
              />
            </div>

            <div style={{ 
              marginTop: 'auto', 
              paddingTop: 40, 
              display: 'flex', 
              gap: 20
            }}>
              <button type="submit" style={{ ...adminButtonStyle, flex: 2, height: 60, fontSize: 16 }} disabled={saving}>
                {saving ? "Salvando..." : "Confirmar e Salvar"}
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
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .stat-card {
          animation: fadeIn 0.4s ease-out forwards;
        }
        .table-row {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
