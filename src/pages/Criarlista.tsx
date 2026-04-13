import { useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBubble from "../components/StatusBubble";

type ListItem = {
  name: string;
  qty: number;
};

const STORAGE_KEY = "geofertas_current_list";

export default function CriarLista() {
  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [qty, setQty] = useState(1);
  const [items, setItems] = useState<ListItem[]>([]);

  function addItem() {
    const name = input.trim();
    if (!name) return;

    setItems((prev) => {
      const existing = prev.find((i) => i.name.toLowerCase() === name.toLowerCase());

      if (existing) {
        return prev.map((i) =>
          i.name.toLowerCase() === name.toLowerCase()
            ? { ...i, qty: i.qty + qty }
            : i
        );
      }

      return [...prev, { name, qty }];
    });

    setInput("");
    setQty(1);
  }

  function removeItem(name: string) {
    setItems((prev) => prev.filter((i) => i.name !== name));
  }

  function handleVerResultado() {
    if (!items.length) return;

    const payload = {
      createdAt: new Date().toISOString(),
      items,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    navigate("/resultado-lista");
  }

  return (
    <div className="container">
      <div className="hero">
        <div className="heroTitle">Montar Lista</div>
        <div className="heroSub">
          Adicione seus itens para comparar as lojas
        </div>
      </div>

      <StatusBubble text="Adicione os produtos 🛒" />

      <div className="card">
        <input
          className="input"
          placeholder="Ex: arroz"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <input
          className="input"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />

        <button className="btn btnPrimary" onClick={addItem}>
          + Adicionar
        </button>
      </div>

      {items.length > 0 && (
        <>
          <div className="card">
            <div className="cardTitle">Itens da Lista</div>

            <ul className="list">
              {items.map((item) => (
                <li key={item.name}>
                  {item.name} (x{item.qty}){" "}
                  <button
                    className="btn btnDanger"
                    onClick={() => removeItem(item.name)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card ctaBox">
            <div className="ctaTitle">Total de Itens</div>
            <div className="ctaValue">{items.length}</div>

            <button className="btn btnPrimary" onClick={handleVerResultado}>
              Ver onde comprar mais barato
            </button>
          </div>
        </>
      )}
    </div>
  );
}