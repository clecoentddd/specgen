import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`App running on http://localhost:${PORT}`);
});
