import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { db } from "../../firebase";
import {
  adminButtonStyle,
  adminGridStyle,
  adminInputStyle,
  adminPanelStyle,
  adminSecondaryButtonStyle,
  adminShellStyle,
} from "./adminStyles";

type OfferRecord = {
  id: string;
  productName: string;
  marketName: string;
  networkName?: string;
  marketId?: string;
  category?: string;
  price: number;
  active?: boolean;
  startsAt?: string;
  expiresAt?: string;
};

type OfferFormState = {
  productName: string;
  marketName: string;
  networkName: string;
  marketId: string;
  category: string;
  price: string;
  expiresAt: string;
};

const initialForm: OfferFormState = {
  productName: "",
  marketName: "",
  networkName: "",
  marketId: "",
  category: "",
  price: "",
  expiresAt: "",
};

export default function AdminOffers() {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [form, setForm] = useState<OfferFormState>(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  async function loadOffers() {
    const snap = await getDocs(query(collection(db, "offers"), orderBy("productName")));
    const items = snap.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      return {
        id: docSnap.id,
        productName: String(data.productName || data.name || ""),
        marketName: String(data.marketName || data.networkName || ""),
        networkName: String(data.networkName || ""),
        marketId: String(data.marketId || ""),
        category: String(data.category || ""),
        price: Number(data.price || data.promoPrice || 0),
        active: data.active !== false && data.isActive !== false,
        startsAt: String(data.startsAt || ""),
        expiresAt: String(data.expiresAt || ""),
      };
    });

    setOffers(items);
  }

  useEffect(() => {
    loadOffers().catch((error) => {
      console.error("[AdminOffers] load error", error);
      setFeedback("Nao foi possivel carregar as ofertas.");
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");

    try {
      await addDoc(collection(db, "offers"), {
        productName: form.productName.trim(),
        marketName: form.marketName.trim(),
        networkName: form.networkName.trim() || form.marketName.trim(),
        marketId: form.marketId.trim() || null,
        category: form.category.trim() || "geral",
        price: Number(form.price),
        active: true,
        startsAt: new Date().toISOString(),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(initialForm);
      setFeedback("Oferta cadastrada com sucesso.");
      await loadOffers();
    } catch (error) {
      console.error("[AdminOffers] save error", error);
      setFeedback("Erro ao cadastrar oferta.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleOffer(offer: OfferRecord) {
    try {
      await updateDoc(doc(db, "offers", offer.id), {
        active: !offer.active,
        updatedAt: serverTimestamp(),
      });
      await loadOffers();
    } catch (error) {
      console.error("[AdminOffers] toggle error", error);
      setFeedback("Erro ao atualizar status da oferta.");
    }
  }

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <h1 style={{ margin: 0, color: "#17332f" }}>Ofertas</h1>
          <p style={{ margin: 0, color: "rgba(23,51,47,0.74)", lineHeight: 1.7 }}>
            Cadastre novas ofertas e controle rapidamente o status ativo do que entra no MVP.
          </p>
        </div>
      </section>

      <section style={adminPanelStyle}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={adminGridStyle}>
            <input
              style={adminInputStyle}
              placeholder="Produto"
              value={form.productName}
              onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Mercado"
              value={form.marketName}
              onChange={(event) => setForm((current) => ({ ...current, marketName: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Rede"
              value={form.networkName}
              onChange={(event) => setForm((current) => ({ ...current, networkName: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              placeholder="Market ID"
              value={form.marketId}
              onChange={(event) => setForm((current) => ({ ...current, marketId: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              placeholder="Categoria"
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              type="number"
              step="0.01"
              min="0"
              placeholder="Preco"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              type="date"
              value={form.expiresAt}
              onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button type="submit" style={adminButtonStyle} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Cadastrar oferta"}
            </button>
            {feedback ? (
              <span style={{ color: "#0f6d61", fontWeight: 700 }}>{feedback}</span>
            ) : null}
          </div>
        </form>
      </section>

      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ margin: 0, color: "#17332f" }}>Lista de ofertas</h2>
            <span style={{ color: "rgba(23,51,47,0.66)", fontWeight: 700 }}>
              {offers.length} registros
            </span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {offers.map((offer) => (
              <article
                key={offer.id}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: "white",
                  border: "1px solid rgba(15,53,47,0.08)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900, color: "#15322d" }}>{offer.productName || "Oferta sem nome"}</div>
                    <div style={{ marginTop: 4, color: "rgba(21,50,45,0.72)" }}>
                      {offer.marketName} {offer.networkName ? `• ${offer.networkName}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900, color: "#0f6d61" }}>
                      R$ {offer.price.toFixed(2).replace(".", ",")}
                    </div>
                    <div style={{ marginTop: 4, color: offer.active ? "#127b55" : "#9a3b3b", fontWeight: 800 }}>
                      {offer.active ? "Ativa" : "Inativa"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {offer.category ? (
                    <span style={{ color: "rgba(21,50,45,0.66)" }}>Categoria: {offer.category}</span>
                  ) : null}
                  {offer.expiresAt ? (
                    <span style={{ color: "rgba(21,50,45,0.66)" }}>
                      Expira em {new Date(offer.expiresAt).toLocaleDateString("pt-BR")}
                    </span>
                  ) : null}
                </div>

                <div>
                  <button
                    type="button"
                    style={adminSecondaryButtonStyle}
                    onClick={() => toggleOffer(offer)}
                  >
                    {offer.active ? "Inativar oferta" : "Ativar oferta"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
