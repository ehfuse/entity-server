import { useState } from "react";
import {
    Box,
    Drawer,
    AppBar,
    Toolbar,
    List,
    Typography,
    Divider,
    IconButton,
    Avatar,
    Menu,
    MenuItem,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
} from "@mui/material";
import {
    Menu as MenuIcon,
    Dashboard as DashboardIcon,
    Storage as StorageIcon,
    Logout as LogoutIcon,
    Person as PersonIcon,
    MenuBook as MenuBookIcon,
} from "@mui/icons-material";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthController } from "../../modules/dashboard/controllers/authController";
import { useAdminController } from "../../modules/dashboard/controllers/adminController";

const drawerWidth = 240;

const MainLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout } = useAuthController();
    const { user } = useAdminController();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleUserMenuClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
        handleUserMenuClose();
    };

    const menuItems = [
        { text: "대시보드", icon: <DashboardIcon />, path: "/dashboard" },
        { text: "엔티티 관리", icon: <StorageIcon />, path: "/entities" },
        { text: "도움말", icon: <MenuBookIcon />, path: "/help" },
    ];

    const drawer = (
        <div>
            <Toolbar>
                <Typography variant="h6" noWrap component="div">
                    Entity Admin
                </Typography>
            </Toolbar>
            <Divider />
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.path} disablePadding>
                        <ListItemButton
                            selected={location.pathname.startsWith(item.path)}
                            onClick={() => navigate(item.path)}
                            sx={{ py: 0.75 }}
                        >
                            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </div>
    );

    return (
        <Box sx={{ display: "flex" }}>
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
                        onClick={handleDrawerToggle}
                        sx={{ mr: 2, display: { sm: "none" } }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography
                        variant="h6"
                        noWrap
                        component="div"
                        sx={{ flexGrow: 1 }}
                    >
                        {menuItems.find((item) =>
                            location.pathname.startsWith(item.path),
                        )?.text || ""}
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
                        <MenuItem onClick={handleLogout}>
                            <ListItemIcon>
                                <LogoutIcon fontSize="small" />
                            </ListItemIcon>
                            로그아웃
                        </MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>
            <Box
                component="nav"
                sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
            >
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{
                        keepMounted: true,
                    }}
                    sx={{
                        display: { xs: "block", sm: "none" },
                        "& .MuiDrawer-paper": {
                            boxSizing: "border-box",
                            width: drawerWidth,
                            backgroundColor: "#112732",
                            color: "#fff",
                            "& .MuiListItemIcon-root": {
                                color: "#fff",
                            },
                            "& .MuiDivider-root": {
                                borderColor: "rgba(255,255,255,0.2)",
                            },
                        },
                    }}
                >
                    {drawer}
                </Drawer>
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: "none", sm: "block" },
                        "& .MuiDrawer-paper": {
                            boxSizing: "border-box",
                            width: drawerWidth,
                            backgroundColor: "#112732",
                            color: "#fff",
                            "& .MuiListItemIcon-root": {
                                color: "#fff",
                            },
                            "& .MuiDivider-root": {
                                borderColor: "rgba(255,255,255,0.2)",
                            },
                        },
                    }}
                    open
                >
                    {drawer}
                </Drawer>
            </Box>
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 3,
                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                    height: "100vh",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#e9eef4",
                }}
            >
                <Toolbar />
                <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
};

export default MainLayout;
