import { useRoutes } from "react-router-dom";
import Homepage from "../pages/Homepage";
import Admin from "../pages/admin"
import Page404 from "../pages/404";
import Dashboard from "../pages/dashboard";
import Timeline from "../pages/timeline"
import Konfirmasi from "../pages/Konfirmasi"
import TrackingPage from "../pages/tracking";
import ViewDetail from "../pages/viewDetail";
import Report from "../pages/report";

export default function Routes() {
  const element = useRoutes([
    { path: "/", element: <Homepage /> },
    { path: "/admin", element: <Admin /> },
    { path: "/dashboard", element: <Dashboard /> },
    { path: "/timeline", element: <Timeline /> },
    { path: "/konfirmasi", element: <Konfirmasi /> },
    { path: "/track", element: <TrackingPage /> },
    { path: "/report", element: <Report /> },
    { path: "/view-details/:trxId", element: <ViewDetail /> },
    { path: "*", element: <Page404 /> },
  ]);
  return element;
}
