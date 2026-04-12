import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./Layout";

import Home from "../pages/Home";
import Analises from "../pages/Analises";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/analises" element={<Analises />} />
        <Route path="/criar-lista" element={<Navigate to="/" replace />} />
        <Route path="/consultar-preco" element={<Navigate to="/" replace />} />
        <Route path="/resultado-lista" element={<Navigate to="/" replace />} />
        <Route path="/lista/:userId/:listId" element={<Navigate to="/" replace />} />
        <Route path="/minhas-listas" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
