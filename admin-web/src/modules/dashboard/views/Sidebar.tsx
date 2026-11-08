import React from "react";
import {
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
    Divider,
} from "@mui/material";
import {
    Dashboard as DashboardIcon,
    Storage as StorageIcon,
    Settings as SettingsIcon,
    HelpOutline as HelpIcon,
    People as PeopleIcon,
    VpnKey as LicenseIcon,
    Security as SecurityIcon,
    Key as KeyIcon,
} from "@mui/icons-material";
import { useNavigate, useLocation, Link } from "react-router-dom";

export const drawerWidth = 240;

const menuItems = [
    { text: "대시보드", icon: <DashboardIcon />, path: "/dashboard" },
    {
        text: "계정 관리",
        icon: <PeopleIcon />,
        path: "/users",
        beforeDivider: true,
    },
    { text: "라이선스 관리", icon: <LicenseIcon />, path: "/licenses" },
    { text: "권한 관리", icon: <SecurityIcon />, path: "/roles" },
    { text: "API 키 관리", icon: <KeyIcon />, path: "/api-keys" },
    {
        text: "엔티티 목록",
        icon: <StorageIcon />,
        path: "/entities",
        beforeDivider: true,
    },
    {
        text: "ERD",
        icon: <StorageIcon />,
        path: "/erd-mermaid",
    },
    {
        text: "Query",
        icon: <StorageIcon />,
        path: "/query-editor",
        beforeDivider: true,
    },
    {
        text: "설정",
        icon: <SettingsIcon />,
        path: "/configs",
        beforeDivider: true,
    },
    { text: "도움말", icon: <HelpIcon />, path: "/help", beforeDivider: true },
];

const drawerPaperSx = {
    boxSizing: "border-box",
    width: drawerWidth,
    backgroundColor: "#112732",
    color: "#fff",
    "& .MuiListItemIcon-root": { color: "#fff" },
    "& .MuiDivider-root": { borderColor: "rgba(255,255,255,0.2)" },
};

interface SidebarProps {
    mobileOpen: boolean;
    onClose: () => void;
}

const Sidebar = ({ mobileOpen, onClose }: SidebarProps) => {
    const navigate = useNavigate();
    const location = useLocation();

    const drawerContent = (
        <div>
            <Toolbar>
                <Typography variant="h6" noWrap component="div">
                    <Link
                        to="/dashboard"
                        style={{ color: "inherit", textDecoration: "none" }}
                    >
                        Entity Admin
                    </Link>
                </Typography>
            </Toolbar>
            <Divider />
            <List>
                {menuItems.map((item) => (
                    <React.Fragment key={item.path}>
                        {item.beforeDivider && <Divider sx={{ my: 1 }} />}
                        <ListItem disablePadding>
                            <ListItemButton
                                selected={location.pathname.startsWith(
                                    item.path,
                                )}
                                onClick={() => navigate(item.path)}
                                sx={{
                                    "&.Mui-selected": {
                                        backgroundColor:
                                            "rgba(255,255,255,0.12)",
                                        "&:hover": {
                                            backgroundColor:
                                                "rgba(255,255,255,0.18)",
                                        },
                                    },
                                    "&:hover": {
                                        backgroundColor:
                                            "rgba(255,255,255,0.08)",
                                    },
                                }}
                            >
                                <ListItemIcon>{item.icon}</ListItemIcon>
                                <ListItemText primary={item.text} />
                            </ListItemButton>
                        </ListItem>
                    </React.Fragment>
                ))}
            </List>
        </div>
    );

    return (
        <nav style={{ width: drawerWidth, flexShrink: 0 }}>
            {/* 모바일용 임시 Drawer */}
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={onClose}
                ModalProps={{ keepMounted: true }}
                sx={{
                    display: { xs: "block", sm: "none" },
                    "& .MuiDrawer-paper": drawerPaperSx,
                }}
            >
                {drawerContent}
            </Drawer>
            {/* 데스크톱용 고정 Drawer */}
            <Drawer
                variant="permanent"
                open
                sx={{
                    display: { xs: "none", sm: "block" },
                    "& .MuiDrawer-paper": drawerPaperSx,
                }}
            >
                {drawerContent}
            </Drawer>
        </nav>
    );
};

export default Sidebar;
