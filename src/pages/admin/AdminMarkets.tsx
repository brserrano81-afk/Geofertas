import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { db } from "../../firebase";
import {
  adminButtonStyle,
  adminGridStyle,
  adminInputStyle,
  adminPanelStyle,
  adminShellStyle,
} from "./adminStyles";

type MarketRecord = {
  id: string;
  name: string;
  networkId?: string;
  address?: string;
  active?: boolean;
};

type MarketFormState = {
  name: string;
  networkId: string;
  address: string;
  lat: string;
  lng: string;
};

const initialForm: MarketFormState = {
  name: "",
  networkId: "",
  address: "",
  lat: "",
  lng: "",
};

export default function AdminMarkets() {
  const [markets, setMarkets] = useState<MarketRecord[]>([]);
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function loadMarkets() {
    const snap = await getDocs(query(collection(db, "markets"), orderBy("name")));
    setMarkets(
      snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          name: String(data.name || ""),
          networkId: String(data.networkId || ""),
          address: String(data.address || ""),
          active: data.active !== false,
        };
      }),
    );
  }

  useEffect(() => {
    loadMarkets().catch((error) => {
      console.error("[AdminMarkets] load error", error);
      setFeedback("Nao foi possivel carregar os mercados.");
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");

    try {
      await addDoc(collection(db, "markets"), {
        name: form.name.trim(),
        networkId: form.networkId.trim() || null,
        address: form.address.trim() || null,
        location:
          form.lat && form.lng
            ? {
                lat: Number(form.lat),
                lng: Number(form.lng),
              }
            : null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(initialForm);
      setFeedback("Mercado cadastrado com sucesso.");
      await loadMarkets();
    } catch (error) {
      console.error("[AdminMarkets] save error", error);
      setFeedback("Erro ao cadastrar mercado.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <h1 style={{ margin: 0, color: "#17332f" }}>Mercados</h1>
          <p style={{ margin: 0, color: "rgba(23,51,47,0.74)", lineHeight: 1.7 }}>
            Cadastre unidades e acompanhe a base atual de mercados usada nas ofertas.
          </p>
        </div>
      </section>

      <section style={adminPanelStyle}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={adminGridStyle}>
            <input
              style={adminInputStyle}
              placeholder="Nome do mercado"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
            <input
              style={adminInputStyle}
              placeholder="Rede / networkId"
              value={form.networkId}
              onChange={(event) => setForm((current) => ({ ...current, networkId: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              placeholder="Endereco"
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              type="number"
              step="0.000001"
              placeholder="Latitude"
              value={form.lat}
              onChange={(event) => setForm((current) => ({ ...current, lat: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              type="number"
              step="0.000001"
              placeholder="Longitude"
              value={form.lng}
              onChange={(event) => setForm((current) => ({ ...current, lng: event.target.value }))}
            />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button type="submit" style={adminButtonStyle} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Cadastrar mercado"}
            </button>
            {feedback ? <span style={{ color: "#0f6d61", fontWeight: 700 }}>{feedback}</span> : null}
          </div>
        </form>
      </section>

      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ margin: 0, color: "#17332f" }}>Lista de mercados</h2>
            <span style={{ color: "rgba(23,51,47,0.66)", fontWeight: 700 }}>
              {markets.length} registros
            </span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {markets.map((market) => (
              <article
                key={market.id}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: "white",
                  border: "1px solid rgba(15,53,47,0.08)",
                }}
              >
                <div style={{ fontWeight: 900, color: "#15322d" }}>{market.name}</div>
                <div style={{ marginTop: 6, color: "rgba(21,50,45,0.72)", lineHeight: 1.6 }}>
                  {market.networkId ? `Rede: ${market.networkId}` : "Sem rede informada"}
                  <br />
                  {market.address || "Endereco nao informado"}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
