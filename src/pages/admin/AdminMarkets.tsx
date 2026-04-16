import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { 
  Store, 
  Plus, 
  Search, 
  MapPin, 
  Edit2, 
  Power, 
  X,
  Buildings
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
    <div style={adminShellStyle}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Mercados</h1>
          <p style={{ margin: '4px 0 0', color: adminColors.textSecondary, fontSize: 15 }}>
            {markets.length} mercados cadastrados no sistema.
          </p>
        </div>
        <button onClick={handleAddClick} style={{ ...adminButtonStyle, gap: 8 }}>
          <Plus size={18} />
          Novo Mercado
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
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: adminColors.neutral }} />
            <input 
              style={{ ...adminInputStyle, paddingLeft: 40 }} 
              placeholder="Buscar por nome, rede ou bairro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <span style={{ fontSize: 13, color: adminColors.textSecondary, marginLeft: 'auto' }}>
            {filteredMarkets.length} resultados encontrados
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminColors.border}` }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Mercado</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Rede</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Localização</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: adminColors.textSecondary, textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: adminColors.textSecondary }}>Carregando mercados...</td>
                </tr>
              ) : filteredMarkets.map((m) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${adminColors.border}`, transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 700, color: adminColors.text }}>{m.nome}</div>
                  </td>
                  <td style={{ padding: '16px', color: adminColors.textSecondary, fontSize: 14 }}>{m.rede}</td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: adminColors.textSecondary }}>
                      <MapPin size={14} />
                      {m.bairro} · {m.cidade}/{m.uf}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={adminBadgeStyle(m.ativo ? "green" : "red")}>
                      {m.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => startEditing(m)}
                        style={{ background: 'transparent', border: 'none', color: adminColors.textSecondary, cursor: 'pointer', padding: 6 }}
                        title="Editar"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggle(m)}
                        style={{ background: 'transparent', border: 'none', color: m.ativo ? adminColors.error : adminColors.success, cursor: 'pointer', padding: 6 }}
                        title={m.ativo ? "Inativar" : "Ativar"}
                      >
                        <Power size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredMarkets.length && !loading && (
             <div style={{ padding: 60, textAlign: 'center', color: adminColors.textSecondary }}>
                Nenhum mercado encontrado.
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
          width: 480,
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
              {editingId ? 'Editar Mercado' : 'Novo Mercado'}
            </h2>
            <button onClick={closeForm} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: adminColors.textSecondary }}>
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 32, display: 'grid', gap: 24, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Nome do Mercado *</label>
              <input
                style={adminInputStyle}
                placeholder="Ex: Supermercado Central"
                value={form.nome}
                onChange={(e) => setForm(c => ({ ...c, nome: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Rede / Grupo *</label>
              <input
                style={adminInputStyle}
                placeholder="Ex: Grupo Pão de Açúcar"
                value={form.rede}
                onChange={(e) => setForm(c => ({ ...c, rede: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Cidade *</label>
                <input
                  style={adminInputStyle}
                  placeholder="Ex: Serra"
                  value={form.cidade}
                  onChange={(e) => setForm(c => ({ ...c, cidade: e.target.value }))}
                  required
                />
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>UF *</label>
                <input
                  style={adminInputStyle}
                  placeholder="ES"
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => setForm(c => ({ ...c, uf: e.target.value.toUpperCase() }))}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Bairro *</label>
              <input
                style={adminInputStyle}
                placeholder="Ex: Laranjeiras"
                value={form.bairro}
                onChange={(e) => setForm(c => ({ ...c, bairro: e.target.value }))}
                required
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: adminColors.text }}>Endereço Completo *</label>
              <input
                style={adminInputStyle}
                placeholder="Av. Central, 123"
                value={form.endereco}
                onChange={(e) => setForm(c => ({ ...c, endereco: e.target.value }))}
                required
              />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 12 }}>
              <button type="submit" style={{ ...adminButtonStyle, flex: 1 }} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
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
