import express from 'express';
import cors from 'cors';
import modelRouter from './routes/models.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/models', modelRouter);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});