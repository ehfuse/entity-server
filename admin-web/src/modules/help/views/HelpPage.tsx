import { Box } from "@mui/material";

const HelpPage = () => {
    return (
        <Box
            sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        >
            <iframe
                src="https://ehfuse.github.io/entity-server/"
                style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                    display: "block",
                }}
                title="도움말"
            />
        </Box>
    );
};

export default HelpPage;
