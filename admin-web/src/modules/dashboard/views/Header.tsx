import {
    AppBar,
    Avatar,
    Box,
    IconButton,
    ListItemIcon,
    Menu,
    MenuItem,
    Toolbar,
    Typography,
} from "@mui/material";
import {
    Menu as MenuIcon,
    ArrowBack as ArrowBackIcon,
    Logout as LogoutIcon,
    Person as PersonIcon,
} from "@mui/icons-material";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLoginController } from "../../login/controllers/loginController";
import { useDashboardController } from "../controllers/dashboardController";
import { drawerWidth } from "./Sidebar";

const getHeaderTitle = (pathname: string) => {
    const entityDataMatch = pathname.match(/^\/entities\/([^/]+)\/data$/);
    if (entityDataMatch?.[1]) {
        return `${decodeURIComponent(entityDataMatch[1])} 데이터`;
    }
    if (pathname.startsWith("/entities")) return "엔티티 관리";
    if (pathname.startsWith("/configs")) return "설정 관리";
    if (pathname.startsWith("/dashboard")) return "대시보드";
    if (pathname.startsWith("/users")) return "사용자 관리";
    if (pathname.startsWith("/licenses")) return "라이선스 관리";
    if (pathname.startsWith("/roles")) return "권한 관리";
    if (pathname.startsWith("/api-keys")) return "API 키 관리";
    if (pathname.startsWith("/erd-flow-2")) return "ERD (Flow 2)";
    if (pathname.startsWith("/erd-flow")) return "ERD (Flow)";
    if (pathname.startsWith("/erd-mermaid")) return "ERD (Mermaid)";
    if (pathname.startsWith("/erd")) return "ERD";
    if (pathname.startsWith("/help")) return "도움말";
    return "";
};

interface HeaderProps {
    onMenuClick: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { state } = useLoginController();
    const { user } = useDashboardController();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleUserMenuClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = async () => {
        await state.actions.logout();
        navigate("/login");
        handleUserMenuClose();
    };

    return (
        <AppBar
            position="fixed"
            sx={{
                width: { sm: `calc(100% - ${drawerWidth}px)` },
                ml: { sm: `${drawerWidth}px` },
                bgcolor: "#fff",
                color: "#1f2937",
                boxShadow: "none",
                borderBottom: "1px solid #e5e7eb",
            }}
        >
            <Toolbar>
                <IconButton
                    color="inherit"
                    aria-label="open drawer"
                    edge="start"
                    onClick={onMenuClick}
                    sx={{ mr: 2, display: { sm: "none" } }}
                >
                    <MenuIcon />
                </IconButton>
                {/^\/entities\/[^/]+\/data$/.test(location.pathname) && (
                    <IconButton
                        color="inherit"
                        onClick={() => navigate("/entities")}
                        sx={{ mr: 1 }}
                    >
                        <ArrowBackIcon />
                    </IconButton>
                )}
                <Typography
                    variant="h6"
                    noWrap
                    component="div"
                    sx={{ flexGrow: 1 }}
                >
                    {getHeaderTitle(location.pathname)}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2">
                        {user?.name || user?.email || "User"}
                    </Typography>
                    <IconButton onClick={handleUserMenuOpen} size="small">
                        <Avatar sx={{ width: 32, height: 32 }}>
                            <PersonIcon />
                        </Avatar>
                    </IconButton>
                </Box>
                <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleUserMenuClose}
                >
                    <MenuItem onClick={() => void handleLogout()}>
                        <ListItemIcon>
                            <LogoutIcon fontSize="small" />
                        </ListItemIcon>
                        로그아웃
                    </MenuItem>
                </Menu>
            </Toolbar>
        </AppBar>
    );
};

export default Header;
