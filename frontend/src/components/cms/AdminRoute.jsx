import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasCmsSession } from "@/lib/cms";

export default function AdminRoute() {
  const location = useLocation();
  return hasCmsSession()
    ? <Outlet />
    : <Navigate to="/blog/admin/login" replace state={{ from: location.pathname }} />;
}
