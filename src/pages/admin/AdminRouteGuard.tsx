import { Navigate, Outlet, useLocation } from "react-router-dom";

import { isAdminAuthenticated, isAdminConfigured } from "./adminAuth";

export default function AdminRouteGuard() {
  const location = useLocation();

  if (!isAdminConfigured()) {
    return <Navigate to="/" replace />;
  }

  if (!isAdminAuthenticated()) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
