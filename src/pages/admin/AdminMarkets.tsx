import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import {
  adminMvpService,
  createEmptyMarketInput,
  marketToInput,
  normalizeMarketInput,
  type MarketInput,
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
  adminTopbarStyle,
} from "./adminStyles";

export default function AdminMarkets() {
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [form, setForm] = useState<MarketInput>(createEmptyMarketInput());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const orderedMarkets = useMemo(
    () => [...markets].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [markets],
  );

  async function loadMarkets() {
    const items = await adminMvpService.listMarkets();
    setMarkets(items);
  }

  useEffect(() => {
    loadMarkets()
      .catch((error) => {
        console.error("[AdminMarkets] load error", error);
        setFeedback("Nao foi possivel carregar os mercados.");
      })
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setForm(createEmptyMarketInput());
    setEditingId(null);
  }

  function startEditing(record: MarketRecord) {
    setForm(marketToInput(record));
    setEditingId(record.id);
    setFeedback("");
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

      resetForm();
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
      setFeedback(`Mercado ${record.ativo ? "inativado" : "ativado"} com sucesso.`);
      await loadMarkets();
    } catch (error) {
      console.error("[AdminMarkets] toggle error", error);
      setFeedback("Erro ao atualizar status do mercado.");
    }
  }

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={adminTopbarStyle}>
            <div style={{ display: "grid", gap: 8 }}>
              <span style={adminBadgeStyle("green")}>Mercados</span>
              <h1 style={{ margin: 0, color: "#17332f" }}>Cadastro de mercados</h1>
              <p style={{ margin: 0, color: "rgba(23,51,47,0.74)", lineHeight: 1.7 }}>
                Cadastre, edite e ative mercados usados pelas ofertas e pela landing.
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
              placeholder="Nome do mercado"
              value={form.nome}
              onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Rede"
              value={form.rede}
              onChange={(event) => setForm((current) => ({ ...current, rede: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Bairro"
              value={form.bairro}
              onChange={(event) => setForm((current) => ({ ...current, bairro: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Cidade"
              value={form.cidade}
              onChange={(event) => setForm((current) => ({ ...current, cidade: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="UF"
              maxLength={2}
              value={form.uf}
              onChange={(event) => setForm((current) => ({ ...current, uf: event.target.value.toUpperCase() }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Endereco"
              value={form.endereco}
              onChange={(event) => setForm((current) => ({ ...current, endereco: event.target.value }))}
              required
            />
          </div>

          <div style={adminActionsRowStyle}>
            <button type="submit" style={adminButtonStyle} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar mercado" : "Cadastrar mercado"}
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
            <h2 style={{ margin: 0, color: "#17332f" }}>Lista de mercados</h2>
            <span style={adminBadgeStyle("neutral")}>
              {loading ? "Carregando..." : `${orderedMarkets.length} registros`}
            </span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {orderedMarkets.map((market) => (
              <article
                key={market.id}
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
                    <div style={{ fontWeight: 900, color: "#15322d" }}>{market.nome}</div>
                    <div style={{ marginTop: 6, color: "rgba(21,50,45,0.72)", lineHeight: 1.6 }}>
                      {market.rede} · {market.bairro} · {market.cidade} - {market.uf}
                      <br />
                      {market.endereco}
                    </div>
                  </div>
                  <span style={adminBadgeStyle(market.ativo ? "green" : "red")}>
                    {market.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <div style={adminActionsRowStyle}>
                  <button type="button" style={adminSecondaryButtonStyle} onClick={() => startEditing(market)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    style={market.ativo ? adminDangerButtonStyle : adminButtonStyle}
                    onClick={() => handleToggle(market)}
                  >
                    {market.ativo ? "Inativar" : "Ativar"}
                  </button>
                </div>
              </article>
            ))}

            {!orderedMarkets.length && !loading ? (
              <div style={{ color: "rgba(23,51,47,0.68)" }}>Nenhum mercado cadastrado ainda.</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
