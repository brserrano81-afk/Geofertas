import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { 
  Megaphone, 
  Plus, 
  Search, 
  Calendar, 
  Edit2, 
  Power, 
  X,
  Bell,
  MapPin
} from "lucide-react";

import {
  adminMvpService,
  campaignToInput,
  createEmptyCampaignInput,
  dateInputFromIso,
  normalizeCampaignInput,
  type CampaignInput,
  type CampaignRecord,
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

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [form, setForm] = useState<CampaignInput>(createEmptyCampaignInput());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function loadData() {
    const [campaignItems, marketItems] = await Promise.all([
      adminMvpService.listCampaigns(),
      adminMvpService.listMarkets(),
    ]);
    setCampaigns(campaignItems);
    setMarkets(marketItems);
  }

  useEffect(() => {
    loadData()
      .catch((error) => {
        console.error("[AdminCampaigns] load error", error);
        setFeedback("Não foi possível carregar as campanhas.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredCampaigns = useMemo(() => {
    let result = [...campaigns];
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(low) || 
        (c.marketName || "").toLowerCase().includes(low)
      );
    }
    return result.sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || ""));
  }, [campaigns, searchTerm]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === form.marketId) || null,
    [form.marketId, markets],
  );

  function handleAddClick() {
    setForm(createEmptyCampaignInput());
    setEditingId(null);
    setIsFormOpen(true);
    setFeedback("");
  }

  function startEditing(record: CampaignRecord) {
    setForm(campaignToInput(record));
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
      const normalized = normalizeCampaignInput(form, selectedMarket);
      if (editingId) {
        await adminMvpService.updateCampaign(editingId, normalized);
        setFeedback("Campanha atualizada com sucesso.");
      } else {
        await adminMvpService.createCampaign(normalized);
        setFeedback("Campanha cadastrada com sucesso.");
      }

      setIsFormOpen(false);
      await loadData();
    } catch (error) {
      console.error("[AdminCampaigns] save error", error);
      setFeedback("Erro ao salvar campanha.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(record: CampaignRecord) {
    try {
      await adminMvpService.toggleCampaignStatus(record);
      await loadData();
    } catch (error) {
      console.error("[AdminCampaigns] toggle error", error);
      setFeedback("Erro ao atualizar status.");
    }
  }

  return (
    <div style={adminShellStyle}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Campanhas</h1>
          <p style={{ margin: '4px 0 0', color: adminColors.textSecondary, fontSize: 15 }}>
            Crie anúncios e promoções sazonais para mercados específicos.
          </p>
        </div>
        <button onClick={handleAddClick} style={{ ...adminButtonStyle, gap: 8 }}>
          <Plus size={18} />
          Nova Campanha
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

      {/* ── Table & Search ───────────────────────────────────── */}
      <section style={adminPanelStyle}>
        <div style={{ position: 'relative', marginBottom: 24, maxWidth: 400 }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
          <input 
            style={{ ...adminInputStyle, paddingLeft: 40 }} 
            placeholder="Buscar campanhas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminColors.border}` }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Nome da Campanha</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Mercado</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Vigência</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: adminColors.textSecondary }}>Carregando campanhas...</td>
                </tr>
              ) : filteredCampaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${adminColors.border}`, transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F59E0B15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
                            <Megaphone size={16} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, color: adminColors.text }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: adminColors.textSecondary, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                        </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px', color: adminColors.textSecondary, fontSize: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MapPin size={14} />
                        {c.marketName || "-"}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: adminColors.textSecondary }}>
                      <Calendar size={14} />
                      {c.startsAt ? new Date(c.startsAt).toLocaleDateString("pt-BR") : "—"} 
                      <span style={{ opacity: 0.5 }}>→</span>
                      {c.endsAt ? new Date(c.endsAt).toLocaleDateString("pt-BR") : "—"}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    {c.active ? <span style={adminBadgeStyle("green")}>Ativa</span> : <span style={adminBadgeStyle("red")}>Inativa</span>}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => startEditing(c)}
                        style={{ background: 'transparent', border: 'none', color: adminColors.textSecondary, cursor: 'pointer', padding: 6 }}
                        title="Editar"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggle(c)}
                        style={{ background: 'transparent', border: 'none', color: c.active ? adminColors.error : adminColors.success, cursor: 'pointer', padding: 6 }}
                        title={c.active ? "Inativar" : "Ativar"}
                      >
                        <Power size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredCampaigns.length && !loading && (
             <div style={{ padding: 60, textAlign: 'center', color: adminColors.textSecondary }}>
                Nenhuma campanha encontrada.
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
              {editingId ? 'Editar Campanha' : 'Nova Campanha'}
            </h2>
            <button onClick={closeForm} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: adminColors.textSecondary }}>
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 32, display: 'grid', gap: 24, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Nome da Campanha *</label>
              <input
                style={adminInputStyle}
                placeholder="Ex: Liquidação de Verão"
                value={form.name}
                onChange={(e) => setForm(c => ({ ...c, name: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Mercado vinculado *</label>
                <select
                    style={adminInputStyle}
                    value={form.marketId}
                    onChange={(e) => setForm(c => ({ ...c, marketId: e.target.value }))}
                    required
                >
                    <option value="">Selecione o mercado...</option>
                    {markets.map(m => (
                        <option key={m.id} value={m.id}>{m.nome} ({m.bairro})</option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Início da Vigência *</label>
                    <input
                        style={adminInputStyle}
                        type="date"
                        value={dateInputFromIso(form.startsAt)}
                        onChange={(e) => setForm(c => ({ ...c, startsAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Fim da Vigência *</label>
                    <input
                        style={adminInputStyle}
                        type="date"
                        value={dateInputFromIso(form.endsAt)}
                        onChange={(e) => setForm(c => ({ ...c, endsAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Descrição / Detalhes *</label>
              <textarea
                style={{ ...adminInputStyle, minHeight: 120, resize: 'vertical' }}
                placeholder="Detalhes da promoção, regras ou avisos..."
                value={form.description}
                onChange={(e) => setForm(c => ({ ...c, description: e.target.value }))}
                required
              />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 12 }}>
              <button type="submit" style={{ ...adminButtonStyle, flex: 1 }} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Campanha"}
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
