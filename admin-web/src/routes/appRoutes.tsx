import {
    createBrowserRouter,
    Navigate,
    RouterProvider,
} from "react-router-dom";
import { appRoutes } from "./adminRoutes";

function AppRouter() {
    const allRoutes = [
        ...appRoutes,
        {
            path: "*",
            element: <Navigate to="/" replace />,
        },
    ];

    const router = createBrowserRouter(allRoutes);
    return <RouterProvider router={router} />;
}

export default AppRouter;
