import { createTheme } from "@mui/material/styles";
import { koKR } from "@mui/material/locale";

const MuiTheme = createTheme(
    {
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
