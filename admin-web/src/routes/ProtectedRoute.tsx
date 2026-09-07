import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useLoginController } from "../modules/login/controllers/loginController";

interface ProtectedRouteProps {
    children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { isAuthenticated } = useLoginController();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
