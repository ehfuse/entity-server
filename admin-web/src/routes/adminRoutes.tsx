import { Navigate, type RouteObject } from "react-router-dom";
import DashboardLayout from "../modules/dashboard/views/DashboardLayout";
import LoginPage from "../modules/login/views/LoginPage";
import DashboardSummary from "../modules/dashboard/views/Summary";
import EntitiesListPage from "../modules/entities/views/EntitiesListPage";
import EntityDetailPage from "../modules/entities/views/EntityDetailPage";
import EntityDataPage from "../modules/entities/views/EntityDataPage";
import ConfigsPage from "../modules/configs/views/ConfigsPage";
import HelpPage from "../modules/help/views/HelpPage";
import ErdMermaidPage from "../modules/erd/views/ErdMermaidPage";
import AccountsListPage from "../modules/accounts/views/AccountsListPage";
import LicensesListPage from "../modules/licenses/views/LicensesListPage";
import RolesListPage from "../modules/roles/views/RolesListPage";
import ApiKeysListPage from "../modules/apikeys/views/ApiKeysListPage";
import QueryEditorPage from "../modules/query/views/QueryEditorPage";
import ProtectedRoute from "./ProtectedRoute";

export const appRoutes: RouteObject[] = [
    {
        path: "/login",
        element: <LoginPage />,
    },
    {
        path: "/",
        element: (
            <ProtectedRoute>
                <DashboardLayout />
            </ProtectedRoute>
        ),
        children: [
            {
                index: true,
                element: <Navigate to="/dashboard" replace />,
            },
            {
                path: "dashboard",
                element: <DashboardSummary />,
            },
            {
                path: "entities",
                element: <EntitiesListPage />,
            },
            {
                path: "entities/:entityName",
                element: <EntityDetailPage />,
            },
            {
                path: "entities/:entityName/data",
                element: <EntityDataPage />,
            },
            {
                path: "configs",
                element: <ConfigsPage />,
            },
            {
                path: "users",
                element: <AccountsListPage />,
            },
            {
                path: "licenses",
                element: <LicensesListPage />,
            },
            {
                path: "roles",
                element: <RolesListPage />,
            },
            {
                path: "api-keys",
                element: <ApiKeysListPage />,
            },
            {
                path: "query-editor",
                element: <QueryEditorPage />,
            },
            {
                path: "help",
                element: <HelpPage />,
            },
            {
                path: "erd-mermaid",
                element: <ErdMermaidPage />,
            },
        ],
    },
];
