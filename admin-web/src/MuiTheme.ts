import { createTheme } from "@mui/material/styles";
import { koKR } from "@mui/material/locale";

declare module "@mui/material/styles" {
    interface BreakpointOverrides {
        xxl: true;
        xxxl: true;
    }
}
const MuiTheme = createTheme(
    {
        breakpoints: {
            values: {
                xs: 0,
                sm: 600,
                md: 900,
                lg: 1200,
                xl: 1536,
                xxl: 1920,
                xxxl: 2560,
            },
        },
        palette: {
            primary: {
                main: "#1c407d",
            },
            secondary: {
                main: "#dc004e",
            },
        },
        components: {
            MuiDialogActions: {
                styleOverrides: {
                    root: {
                        padding: 16,
                    },
                },
            },
            MuiTooltip: {
                styleOverrides: {
                    tooltip: {
                        backgroundColor: "#000",
                        fontSize: "1rem",
                    },
                    arrow: {
                        color: "#000",
                    },
                },
            },
        },
    },
    koKR,
);

export default MuiTheme;
