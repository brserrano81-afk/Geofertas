import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./Layout";

import Home from "../pages/Home";
import Analises from "../pages/Analises";
import AdminHome from "../pages/admin/AdminHome";
import AdminOffers from "../pages/admin/AdminOffers";
import AdminQueue from "../pages/admin/AdminQueue";
import AdminMarkets from "../pages/admin/AdminMarkets";
import AdminCampaigns from "../pages/admin/AdminCampaigns";
import AdminAnalytics from "../pages/admin/AdminAnalytics";
import AdminLogin from "../pages/admin/AdminLogin";
import AdminRouteGuard from "../pages/admin/AdminRouteGuard";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<AdminRouteGuard />}>
          <Route path="/admin" element={<Navigate to="/admin/home" replace />} />
          <Route path="/admin/home" element={<AdminHome />} />
          <Route path="/admin/offers" element={<AdminOffers />} />
          <Route path="/admin/queue" element={<AdminQueue />} />
          <Route path="/admin/markets" element={<AdminMarkets />} />
          <Route path="/admin/campaigns" element={<AdminCampaigns />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
        </Route>
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
