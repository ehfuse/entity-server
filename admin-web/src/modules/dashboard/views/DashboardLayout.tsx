import { useState } from "react";
import { Box, Toolbar } from "@mui/material";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar, { drawerWidth } from "./Sidebar";

const DashboardLayout = () => {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <Box sx={{ display: "flex" }}>
            <Header onMenuClick={() => setMobileOpen((o) => !o)} />
            <Sidebar
                mobileOpen={mobileOpen}
                onClose={() => setMobileOpen(false)}
            />
            <Box
                component="main"
                sx={{
                    flexGrow: 1,

                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                    height: "100vh",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#e9eef4",
                }}
            >
                <Toolbar />
                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                        p: 3,
                        position: "relative",
                    }}
                >
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
};

export default DashboardLayout;
