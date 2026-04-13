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

type CampaignRecord = {
  id: string;
  name: string;
  networkId?: string;
  active?: boolean;
  startsAt?: string;
  expiresAt?: string;
};

type CampaignFormState = {
  name: string;
  networkId: string;
  startsAt: string;
  expiresAt: string;
};

const initialForm: CampaignFormState = {
  name: "",
  networkId: "",
  startsAt: "",
  expiresAt: "",
};

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function loadCampaigns() {
    const snap = await getDocs(query(collection(db, "campaigns"), orderBy("name")));
    setCampaigns(
      snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          name: String(data.name || ""),
          networkId: String(data.networkId || ""),
          active: data.active !== false,
          startsAt: String(data.startsAt || ""),
          expiresAt: String(data.expiresAt || ""),
        };
      }),
    );
  }

  useEffect(() => {
    loadCampaigns().catch((error) => {
      console.error("[AdminCampaigns] load error", error);
      setFeedback("Nao foi possivel carregar as campanhas.");
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");

    try {
      await addDoc(collection(db, "campaigns"), {
        name: form.name.trim(),
        networkId: form.networkId.trim() || null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString(),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(initialForm);
      setFeedback("Campanha cadastrada com sucesso.");
      await loadCampaigns();
    } catch (error) {
      console.error("[AdminCampaigns] save error", error);
      setFeedback("Erro ao cadastrar campanha.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={adminShellStyle}>
      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 8 }}>
          <h1 style={{ margin: 0, color: "#17332f" }}>Campanhas</h1>
          <p style={{ margin: 0, color: "rgba(23,51,47,0.74)", lineHeight: 1.7 }}>
            Cadastre campanhas promocionais simples para organizar validade e ativacao do MVP.
          </p>
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
            <input
              style={adminInputStyle}
              placeholder="Rede / networkId"
              value={form.networkId}
              onChange={(event) => setForm((current) => ({ ...current, networkId: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              type="date"
              value={form.startsAt}
              onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
            />
            <input
              style={adminInputStyle}
              type="date"
              value={form.expiresAt}
              onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
            />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button type="submit" style={adminButtonStyle} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Cadastrar campanha"}
            </button>
            {feedback ? <span style={{ color: "#0f6d61", fontWeight: 700 }}>{feedback}</span> : null}
          </div>
        </form>
      </section>

      <section style={adminPanelStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ margin: 0, color: "#17332f" }}>Lista de campanhas</h2>
            <span style={{ color: "rgba(23,51,47,0.66)", fontWeight: 700 }}>
              {campaigns.length} registros
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
                }}
              >
                <div style={{ fontWeight: 900, color: "#15322d" }}>{campaign.name}</div>
                <div style={{ marginTop: 6, color: "rgba(21,50,45,0.72)", lineHeight: 1.6 }}>
                  {campaign.networkId ? `Rede: ${campaign.networkId}` : "Sem rede informada"}
                  <br />
                  Status: {campaign.active ? "Ativa" : "Inativa"}
                  <br />
                  Inicio: {campaign.startsAt ? new Date(campaign.startsAt).toLocaleDateString("pt-BR") : "nao informado"}
                  <br />
                  Fim: {campaign.expiresAt ? new Date(campaign.expiresAt).toLocaleDateString("pt-BR") : "nao informado"}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
