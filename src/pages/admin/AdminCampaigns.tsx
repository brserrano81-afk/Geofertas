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

  const stats = useMemo(() => {
    const active = campaigns.filter(c => c.active).length;
    const upcoming = campaigns.filter(c => c.startsAt && new Date(c.startsAt) > new Date()).length;
    return { active, upcoming };
  }, [campaigns]);

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
    <div style={{ ...adminShellStyle, gap: 48 }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: '-0.05em', color: adminColors.text }}>Central de Campanhas</h1>
          <p style={{ margin: '8px 0 0', color: adminColors.textSecondary, fontSize: 16, fontWeight: 500 }}>
            {campaigns.length} iniciativas promocionais gerenciadas na plataforma.
          </p>
        </div>
        <button onClick={handleAddClick} style={{ ...adminButtonStyle, height: 52, padding: '0 32px', gap: 12, boxShadow: `0 12px 24px ${adminColors.primary}33` }}>
          <Plus size={22} strokeWidth={3} />
          <span>Criar Campanha</span>
        </button>
      </div>

      {/* ── Stats Cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
        <div style={{ ...adminPanelStyle }}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Em Execução</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{stats.active}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.success, fontWeight: 700 }}>Rodando agora</div>
        </div>
        <div style={{ ...adminPanelStyle }}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Agendadas</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>{stats.upcoming}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.warning, fontWeight: 700 }}>Próximos lançamentos</div>
        </div>
        <div style={{ ...adminPanelStyle }}>
          <div style={{ color: adminColors.textSecondary, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Alcance Estimado</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: adminColors.text }}>12.4k</div>
          <div style={{ marginTop: 12, fontSize: 13, color: adminColors.textSecondary, fontWeight: 600 }}>Usuários ativos</div>
        </div>
        <div style={{ ...adminPanelStyle, background: adminColors.primary, border: 'none' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>ROAS Médio</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>4.2x</div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Alta performance</div>
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
              placeholder="Filtrar por nome ou mercado da campanha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Nome / Descrição</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Mercado Vinculado</th>
                <th style={{ padding: '20px 40px', fontSize: 12, fontWeight: 900, color: adminColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Vigência</th>
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
                         <span style={{ fontWeight: 700, color: adminColors.textSecondary, fontSize: 16 }}>Sincronizando campanhas...</span>
                      </div>
                   </td>
                </tr>
              ) : filteredCampaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${adminColors.border}`, transition: 'background 0.2s' }}>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F59E0B15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B', border: '1px solid #F59E0B33' }}>
                            <Megaphone size={22} strokeWidth={1.5} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 900, color: adminColors.text, fontSize: 16 }}>{c.name}</div>
                            <div style={{ fontSize: 13, color: adminColors.textSecondary, marginTop: 4, fontWeight: 600, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                        </div>
                    </div>
                  </td>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: adminColors.text, fontSize: 15 }}>
                        <MapPin size={16} color={adminColors.textSecondary} />
                        {c.marketName || "-"}
                    </div>
                  </td>
                  <td style={{ padding: '32px 40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: adminColors.textSecondary, fontWeight: 700 }}>
                      <Calendar size={16} />
                      {c.startsAt ? new Date(c.startsAt).toLocaleDateString("pt-BR") : "—"} 
                      <span style={{ opacity: 0.5 }}>→</span>
                      {c.endsAt ? new Date(c.endsAt).toLocaleDateString("pt-BR") : "—"}
                    </div>
                  </td>
                  <td style={{ padding: '32px 40px' }}>
                    {c.active ? (
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
                  </td>
                  <td style={{ padding: '32px 40px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => startEditing(c)}
                        style={{ background: '#F1F5F9', border: 'none', color: adminColors.textSecondary, cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggle(c)}
                        style={{ background: c.active ? `${adminColors.error}10` : `${adminColors.success}10`, border: 'none', color: c.active ? adminColors.error : adminColors.success, cursor: 'pointer', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
             <div style={{ padding: 120, textAlign: 'center', color: adminColors.textSecondary, background: '#F8FAFC' }}>
                <Megaphone size={48} strokeWidth={1.5} style={{ marginBottom: 20, opacity: 0.3 }} />
                <div style={{ fontSize: 18, fontWeight: 700 }}>Nenhuma campanha encontrada</div>
                <div style={{ fontSize: 14 }}>Ajuste os filtros ou crie uma nova iniciativa.</div>
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
                {editingId ? 'Editar Campanha' : 'Nova Campanha'}
              </h2>
              <p style={{ margin: '8px 0 0', fontSize: 16, color: adminColors.textSecondary, fontWeight: 500 }}>Defina o nome e o período da promoção.</p>
            </div>
            <button onClick={closeForm} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: adminColors.textSecondary, width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={24} strokeWidth={3} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 48, display: 'grid', gap: 40, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Nome da Campanha *</label>
              <input
                style={{ ...adminInputStyle, height: 56 }}
                placeholder="Ex: Liquidação de Verão"
                value={form.name}
                onChange={(e) => setForm(c => ({ ...c, name: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mercado vinculado *</label>
                <select
                    style={{ ...adminInputStyle, height: 56, background: '#F8FAFC' }}
                    value={form.marketId}
                    onChange={(e) => setForm(c => ({ ...c, marketId: e.target.value }))}
                    required
                >
                    <option value="">Selecione o mercado alvo...</option>
                    {markets.map(m => (
                        <option key={m.id} value={m.id}>{m.nome} ({m.bairro})</option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Data de Início *</label>
                    <input
                        style={{ ...adminInputStyle, height: 56 }}
                        type="date"
                        value={dateInputFromIso(form.startsAt)}
                        onChange={(e) => setForm(c => ({ ...c, startsAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Data de Término *</label>
                    <input
                        style={{ ...adminInputStyle, height: 56 }}
                        type="date"
                        value={dateInputFromIso(form.endsAt)}
                        onChange={(e) => setForm(c => ({ ...c, endsAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : "" }))}
                        required
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 900, color: adminColors.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Descrição / Regras *</label>
              <textarea
                style={{ ...adminInputStyle, minHeight: 180, resize: 'vertical', padding: '20px' }}
                placeholder="Detalhes da promoção, regras de uso ou avisos importantes..."
                value={form.description}
                onChange={(e) => setForm(c => ({ ...c, description: e.target.value }))}
                required
              />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 48, display: 'flex', gap: 20 }}>
              <button type="submit" style={{ ...adminButtonStyle, flex: 2, height: 60, fontSize: 16 }} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Campanha"}
              </button>
              <button type="button" onClick={closeForm} style={{ ...adminInputStyle, flex: 1, height: 60, background: '#F8FAFC', fontWeight: 800, border: 'none' }}>
                Cancelar
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
