import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { GlobalFormaProvider } from "@ehfuse/forma";
import { AppRouter } from "./routes";
import MuiTheme from "./MuiTheme";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

function App() {
    return (
        <GlobalFormaProvider>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider theme={MuiTheme}>
                    <CssBaseline />
                    <AppRouter />
                </ThemeProvider>
            </QueryClientProvider>
        </GlobalFormaProvider>
    );
}

export default App;
