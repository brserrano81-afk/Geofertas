import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

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
import AdminNav from "./AdminNav";
import {
  adminActionsRowStyle,
  adminBadgeStyle,
  adminButtonStyle,
  adminDangerButtonStyle,
  adminGridStyle,
  adminInputStyle,
  adminPanelStyle,
  adminSecondaryButtonStyle,
  adminShellStyle,
  adminTextAreaStyle,
  adminTopbarStyle,
} from "./adminStyles";

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [form, setForm] = useState<CampaignInput>(createEmptyCampaignInput());
  const [editingId, setEditingId] = useState<string | null>(null);
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
        setFeedback("Nao foi possivel carregar as campanhas.");
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === form.marketId) || null,
    [form.marketId, markets],
  );

  function resetForm() {
    setForm(createEmptyCampaignInput());
    setEditingId(null);
  }

  function startEditing(record: CampaignRecord) {
    setForm(campaignToInput(record));
    setEditingId(record.id);
    setFeedback("");
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

      resetForm();
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
      setFeedback(`Campanha ${record.active ? "inativada" : "ativada"} com sucesso.`);
      await loadData();
    } catch (error) {
      console.error("[AdminCampaigns] toggle error", error);
      setFeedback("Erro ao atualizar status da campanha.");
    }
  }

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={adminTopbarStyle}>
            <div style={{ display: "grid", gap: 8 }}>
              <span style={adminBadgeStyle("green")}>Campanhas</span>
              <h1 style={{ margin: 0, color: "#17332f" }}>Cadastro de campanhas</h1>
              <p style={{ margin: 0, color: "rgba(23,51,47,0.74)", lineHeight: 1.7 }}>
                Organize campanhas por mercado com datas simples de vigencia para operacao do MVP.
              </p>
            </div>
          </div>
          <AdminNav />
        </div>
      </section>

      <section style={adminPanelStyle}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={adminGridStyle}>
            <input
              style={adminInputStyle}
              placeholder="Nome da campanha"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
            <select
              style={adminInputStyle}
              value={form.marketId}
              onChange={(event) => setForm((current) => ({ ...current, marketId: event.target.value }))}
              required
            >
              <option value="">Selecione o mercado</option>
              {markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.nome}
                </option>
              ))}
            </select>
            <input
              style={adminInputStyle}
              type="date"
              value={dateInputFromIso(form.startsAt)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  startsAt: event.target.value ? `${event.target.value}T12:00:00.000Z` : "",
                }))
              }
              required
            />
            <input
              style={adminInputStyle}
              type="date"
              value={dateInputFromIso(form.endsAt)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  endsAt: event.target.value ? `${event.target.value}T12:00:00.000Z` : "",
                }))
              }
              required
            />
          </div>

          <textarea
            style={adminTextAreaStyle}
            placeholder="Descricao da campanha"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            required
          />

          <div style={adminActionsRowStyle}>
            <button type="submit" style={adminButtonStyle} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar campanha" : "Cadastrar campanha"}
            </button>
            {editingId ? (
              <button type="button" style={adminSecondaryButtonStyle} onClick={resetForm}>
                Cancelar edicao
              </button>
            ) : null}
            {feedback ? <span style={{ color: "#0f6d61", fontWeight: 700 }}>{feedback}</span> : null}
          </div>
        </form>
      </section>

      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={adminTopbarStyle}>
            <h2 style={{ margin: 0, color: "#17332f" }}>Lista de campanhas</h2>
            <span style={adminBadgeStyle("neutral")}>
              {loading ? "Carregando..." : `${campaigns.length} campanhas`}
            </span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {campaigns.map((campaign) => (
              <article
                key={campaign.id}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: "white",
                  border: "1px solid rgba(15,53,47,0.08)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={adminTopbarStyle}>
                  <div>
                    <div style={{ fontWeight: 900, color: "#15322d" }}>{campaign.name}</div>
                    <div style={{ marginTop: 6, color: "rgba(21,50,45,0.72)", lineHeight: 1.7 }}>
                      {campaign.marketName || "Sem mercado vinculado"}
                      <br />
                      {campaign.description}
                    </div>
                  </div>
                  <span style={adminBadgeStyle(campaign.active ? "green" : "red")}>
                    {campaign.active ? "Ativa" : "Inativa"}
                  </span>
                </div>

                <div style={{ color: "rgba(21,50,45,0.66)", lineHeight: 1.7 }}>
                  Inicio: {campaign.startsAt ? new Date(campaign.startsAt).toLocaleDateString("pt-BR") : "sem data"} ·
                  Fim: {campaign.endsAt ? new Date(campaign.endsAt).toLocaleDateString("pt-BR") : "sem data"}
                </div>

                <div style={adminActionsRowStyle}>
                  <button type="button" style={adminSecondaryButtonStyle} onClick={() => startEditing(campaign)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    style={campaign.active ? adminDangerButtonStyle : adminButtonStyle}
                    onClick={() => handleToggle(campaign)}
                  >
                    {campaign.active ? "Inativar" : "Ativar"}
                  </button>
                </div>
              </article>
            ))}

            {!campaigns.length && !loading ? (
              <div style={{ color: "rgba(23,51,47,0.68)" }}>Nenhuma campanha cadastrada ainda.</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
