import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

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

export default function AdminOffers() {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [form, setForm] = useState<OfferInput>(createEmptyOfferInput());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
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
        setFeedback("Nao foi possivel carregar as ofertas.");
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
      return true;
    });
  }, [offers, marketFilter, categoryFilter, statusFilter]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === form.marketId) || null,
    [form.marketId, markets],
  );

  function resetForm() {
    setForm(createEmptyOfferInput());
    setEditingId(null);
  }

  function startEditing(record: OfferRecord) {
    setForm(offerToInput(record));
    setEditingId(record.id);
    setFeedback("");
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

      resetForm();
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
      setFeedback(`Oferta ${record.active ? "inativada" : "ativada"} com sucesso.`);
      await loadData();
    } catch (error) {
      console.error("[AdminOffers] toggle error", error);
      setFeedback("Erro ao atualizar status da oferta.");
    }
  }

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={adminTopbarStyle}>
            <div style={{ display: "grid", gap: 8 }}>
              <span style={adminBadgeStyle("green")}>Ofertas</span>
              <h1 style={{ margin: 0, color: "#17332f" }}>Cadastro de ofertas</h1>
              <p style={{ margin: 0, color: "rgba(23,51,47,0.74)", lineHeight: 1.7 }}>
                Gerencie as ofertas compatíveis com a landing. Só entram na Home as ofertas
                ativas, válidas e com dados essenciais preenchidos.
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
              placeholder="Nome do produto"
              value={form.productName}
              onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Categoria"
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Unidade"
              value={form.unit}
              onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              type="number"
              min="0"
              step="0.01"
              placeholder="Preco"
              value={form.price || ""}
              onChange={(event) => setForm((current) => ({ ...current, price: Number(event.target.value) }))}
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
                  {market.nome} · {market.bairro}
                </option>
              ))}
            </select>
            <input
              style={adminInputStyle}
              type="date"
              value={dateInputFromIso(form.expiresAt)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expiresAt: event.target.value ? `${event.target.value}T12:00:00.000Z` : "",
                }))
              }
              required
            />
            <input
              style={adminInputStyle}
              type="date"
              value={dateInputFromIso(form.collectedAt)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  collectedAt: event.target.value ? `${event.target.value}T12:00:00.000Z` : "",
                }))
              }
              required
            />
            <label style={{ ...adminInputStyle, display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => setForm((current) => ({ ...current, featured: event.target.checked }))}
              />
              Destaque na vitrine
            </label>
          </div>

          {selectedMarket ? (
            <div style={{ color: "rgba(23,51,47,0.76)", lineHeight: 1.7 }}>
              Mercado selecionado: <strong>{selectedMarket.nome}</strong> · {selectedMarket.bairro} ·{" "}
              {selectedMarket.cidade} - {selectedMarket.uf}
            </div>
          ) : null}

          <div style={adminActionsRowStyle}>
            <button type="submit" style={adminButtonStyle} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar oferta" : "Cadastrar oferta"}
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
            <h2 style={{ margin: 0, color: "#17332f" }}>Filtros e lista</h2>
            <span style={adminBadgeStyle("neutral")}>
              {loading ? "Carregando..." : `${filteredOffers.length} ofertas`}
            </span>
          </div>

          <div style={adminGridStyle}>
            <select style={adminInputStyle} value={marketFilter} onChange={(event) => setMarketFilter(event.target.value)}>
              <option value="todos">Todos os mercados</option>
              {markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.nome}
                </option>
              ))}
            </select>

            <select style={adminInputStyle} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="todos">Todas as categorias</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              style={adminInputStyle}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as AdminStatusFilter)}
            >
              <option value="todos">Todos os status</option>
              <option value="ativos">Somente ativos</option>
              <option value="inativos">Somente inativos</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {filteredOffers.map((offer) => (
              <article
                key={offer.id}
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
                    <div style={{ fontWeight: 900, color: "#15322d" }}>{offer.productName}</div>
                    <div style={{ marginTop: 6, color: "rgba(21,50,45,0.72)", lineHeight: 1.6 }}>
                      {offer.marketName} · {offer.category} · {offer.unit}
                      <br />
                      {offer.neighborhood} · {offer.city} - {offer.state}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", display: "grid", gap: 8 }}>
                    <span style={{ fontWeight: 900, color: "#0f6d61" }}>{formatCurrency(offer.price)}</span>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {offer.featured ? <span style={adminBadgeStyle("amber")}>Destaque</span> : null}
                      <span style={adminBadgeStyle(offer.active ? "green" : "red")}>
                        {offer.active ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ color: "rgba(21,50,45,0.66)", lineHeight: 1.7 }}>
                  Validade: {formatDateLabel(offer.expiresAt)} · Coleta: {formatDateLabel(offer.collectedAt)}
                </div>

                <div style={adminActionsRowStyle}>
                  <button type="button" style={adminSecondaryButtonStyle} onClick={() => startEditing(offer)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    style={offer.active ? adminDangerButtonStyle : adminButtonStyle}
                    onClick={() => handleToggle(offer)}
                  >
                    {offer.active ? "Inativar" : "Ativar"}
                  </button>
                </div>
              </article>
            ))}

            {!filteredOffers.length && !loading ? (
              <div style={{ color: "rgba(23,51,47,0.68)" }}>Nenhuma oferta encontrada com os filtros atuais.</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
